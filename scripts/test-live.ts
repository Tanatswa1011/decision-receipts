/**
 * Tests for live telemetry: ingest endpoint (auth, validation, duplicates), n8n body
 * compatibility, the event -> decision adapter, and key rotation.
 * Uses a temp folder for live data and a temp .env.local, never the real ones.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dr-live-test-"));
process.env.DR_LIVE_DIR = join(tmp, "live");
process.env.DR_ENV_LOCAL = join(tmp, ".env.local");
process.env.DR_INGEST_KEY = "dr_live_test_key_000000000000";

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function main() {
  const { POST } = await import("@/app/api/events/route");
  const { liveRuns, liveDecisions } = await import("@/lib/live/adapter");
  const { rotateIngestKey } = await import("@/lib/live/ingest-key");
  const { loadDecisions, loadSystems } = await import("@/lib/receipts/data");
  const { buildReceipts } = await import("@/lib/receipts/pipeline");
  const { readLog } = await import("@/lib/live/store");

  const send = async (body: unknown, key: string | null = process.env.DR_INGEST_KEY!) => {
    const res = await POST(new Request("http://localhost/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  const ev = (run: string, seq: number, type: string, extra: Record<string, unknown> = {}) => ({
    event_id: `${run}-${seq}`, event_type: type, agent_id: "test-agent", external_run_id: run, sequence: seq,
    timestamp: "2026-10-07T14:06:00.000Z", status: type === "run.started" ? "started" : type.endsWith("failed") ? "failed" : "completed",
    tool: null, action: null, resource_id: null, before_state: null, after_state: null, risk_metadata: {}, ...extra,
  });
  const decisionStep = (run: string, after: Record<string, unknown>, meta: Record<string, unknown> = {}) =>
    ev(run, 1, "workflow.step.completed", { tool: "procurement", action: "po.approve", resource_id: String(after.po_id ?? "x"), after_state: after, risk_metadata: meta });

  await test("401 without a key and with a wrong key", async () => {
    assert.equal((await send(ev("a", 0, "run.started"), null)).status, 401);
    assert.equal((await send(ev("a", 0, "run.started"), "dr_live_wrong")).status, 401);
  });

  await test("400 for non-JSON and for a body that fails ACPT's schema (and it is logged)", async () => {
    assert.equal((await send("not json")).status, 400);
    const bad = await send({ event_type: "run.started" });
    assert.equal(bad.status, 400);
    assert.ok(readLog().some((l) => l.outcome === "rejected" && l.code === "invalid_body"));
  });

  await test("201 accepted, then 200 duplicate for the same event_id", async () => {
    assert.equal((await send(ev("dup", 0, "run.started"))).status, 201);
    const again = await send(ev("dup", 0, "run.started"));
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
  });

  await test("n8n AI Invoice Agent body shape (string amount, invoice.sent) is accepted and shown as unmapped, not verified", async () => {
    const run = "9001";
    assert.equal((await send({ ...ev(run, 0, "run.started"), agent_id: "agent-invoice-agents" })).status, 201);
    const step = {
      ...ev(run, 2, "workflow.step.completed"), agent_id: "agent-invoice-agents", tool: "invoice-agent", action: "invoice.sent", resource_id: "invoice:INV-1",
      after_state: { invoice_id: "INV-1", client_name: "Example", amount: "4500", status: "Completed" },
    };
    assert.equal((await send(step)).status, 201);
    const done = await send({ ...ev(run, 999, "run.completed"), agent_id: "agent-invoice-agents" });
    assert.equal(done.status, 201);
    assert.equal(done.body.receipt.run_state, "unmapped");
    assert.deepEqual(liveRuns().find((r) => r.run_id === run)!.unmapped_actions, ["invoice.sent"]);
  });

  await test("replayed run for D-014 produces the same decision and the same flagged receipt as the file", async () => {
    const d = loadDecisions().find((x) => x.id === "D-014")!;
    const run = "replay-D-014";
    await send(ev(run, 0, "run.started"));
    await send({ ...decisionStep(run, { ...d.tool_call! }, { source: "replay", decision_id: d.id, receipt_no: d.receipt_no, rationale: d.rationale }), timestamp: d.timestamp });
    const done = await send(ev(run, 2, "run.completed"));
    assert.equal(done.body.receipt.status, "flagged");
    assert.equal(done.body.receipt.eur_at_risk, 8400);
    const live = liveDecisions().find((x) => x.id === "D-014")!;
    assert.deepEqual(live.tool_call, d.tool_call);
    assert.equal(live.timestamp, d.timestamp);
    assert.equal(live.rationale, d.rationale);
    const db = loadSystems();
    const fileVerdicts = buildReceipts({ decisions: [d], db })[0]!.claims.map((c) => `${c.type}:${c.verdict}`);
    const liveVerdicts = buildReceipts({ decisions: [live], db })[0]!.claims.map((c) => `${c.type}:${c.verdict}`);
    assert.deepEqual(liveVerdicts, fileVerdicts);
  });

  await test("amounts as German or English strings are parsed; keys with tabs are normalised", async () => {
    const run = "fmt";
    await send(ev(run, 0, "run.started"));
    await send(decisionStep(run, { "\tPO_ID": "PO-4602", supplier_id: "SUP-101", amount_eur: "7.360,00 EUR", cost_center: "CC-110", contract_id: "CTR-2026-004", iso_certified: "true", budget_available: true }));
    await send(ev(run, 2, "run.completed"));
    const d = liveDecisions().find((x) => x.live?.run_id === run)!;
    assert.equal(d.tool_call!.po_id, "PO-4602");
    assert.equal(d.tool_call!.amount_eur, 7360);
    assert.equal(d.tool_call!.iso_certified, true);
  });

  await test("a run with a failed step gets no receipt; a run without run.completed stays in progress", async () => {
    await send(ev("fail", 0, "run.started"));
    await send(ev("fail", 1, "workflow.step.failed", { tool: "procurement", action: "decide", resource_id: "PO-4601", risk_metadata: { error: "timeout" } }));
    await send(ev("fail", 2, "run.completed"));
    await send(ev("open", 0, "run.started"));
    const runs = liveRuns();
    assert.equal(runs.find((r) => r.run_id === "fail")!.state, "failed");
    assert.equal(runs.find((r) => r.run_id === "fail")!.decision, null);
    assert.equal(runs.find((r) => r.run_id === "open")!.state, "in_progress");
  });

  await test("what the agent saw in a lookup step is kept, and does not change the verdict", async () => {
    const run = "saw";
    await send(ev(run, 0, "run.started"));
    await send(ev(run, 1, "workflow.step.completed", { tool: "supplier-cache", action: "lookup_supplier", resource_id: "SUP-104", after_state: { iso_certified: true, cached_on: "2026-01-15" } }));
    await send({ ...decisionStep(run, { po_id: "PO-4601", supplier_id: "SUP-104", amount_eur: 7560, cost_center: "CC-410", contract_id: "CTR-2026-031", iso_certified: true, budget_available: true }), event_id: "saw-2", sequence: 2, timestamp: "2026-11-08T10:00:00.000Z" });
    const done = await send(ev(run, 3, "run.completed"));
    const d = liveDecisions().find((x) => x.live?.run_id === run)!;
    assert.deepEqual(d.live!.agent_saw["SUP-104"], { iso_certified: true, cached_on: "2026-01-15" });
    assert.equal(done.body.receipt.status, "flagged"); // supplier DB says expired 2026-02-07
  });

  await test("rotating the ingest key makes the old key fail with 401", async () => {
    const old = process.env.DR_INGEST_KEY!;
    const fresh = rotateIngestKey();
    assert.notEqual(fresh, old);
    assert.equal((await send(ev("rot", 0, "run.started"), old)).status, 401);
    assert.equal((await send(ev("rot", 0, "run.started"), fresh)).status, 201);
  });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} live tests passed`);
}

main().catch((e) => {
  rmSync(tmp, { recursive: true, force: true });
  console.error(e);
  process.exit(1);
});
