/**
 * Deterministic tests for the verifier, the schema gate and the AI-off path.
 * No network, no model. Run: npm test
 */
import assert from "node:assert/strict";
import { ExtractionOutputSchema, type Claim } from "@/lib/receipts/claims";
import { findEvidence, loadDecisions, loadSystems } from "@/lib/receipts/data";
import { buildReceipts, mergeClaims } from "@/lib/receipts/pipeline";
import { verifyClaim } from "@/lib/receipts/verify";

const db = loadSystems();
const decisions = loadDecisions();
const byNo = (n: number) => decisions.find((d) => d.receipt_no === n)!;
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
const claim = (c: Omit<Claim, "id" | "source">): Claim => ({ ...c, id: "T:1", source: "llm" }) as Claim;

const receipts = buildReceipts({ decisions, db });
const receipt = (n: number) => receipts.find((r) => r.decision.receipt_no === n)!;

test("demo: #14 is flagged for the ISO cert that expired 8 months earlier, evidence SUP-104", () => {
  const r = receipt(14);
  assert.equal(r.status, "flagged");
  const iso = r.claims.find((c) => c.type === "supplier_iso_certified")!;
  assert.equal(iso.verdict, "contradicted");
  assert.deepEqual(iso.evidence_ids, ["SUP-104"]);
  assert.equal(iso.observed, "2026-02-07");
  assert.equal(r.eur_at_risk, 8400);
});

test("demo: in receipts #1-#20 only #12 (over limit), #14 (expired cert) and #19 (split) are flagged", () => {
  const flagged = receipts.filter((r) => r.decision.receipt_no <= 20 && r.status === "flagged").map((r) => r.decision.receipt_no);
  assert.deepEqual(flagged, [12, 14, 19]);
});

test("policy: #12 approved €18,500 above the €10,000 agent limit, checked by ACPT's compare.ts", () => {
  const c = receipt(12).claims.find((x) => x.type === "policy_approval_limit")!;
  assert.equal(c.verdict, "contradicted");
  assert.deepEqual(c.evidence_ids, ["POL-APPROVAL-01", "PO-4512"]);
  assert.equal(receipt(9).claims.find((x) => x.type === "policy_approval_limit")!.verdict, "verified");
});

test("A5: a cited contract that does not exist is unsupported with no evidence ID", () => {
  const c = receipt(22).claims.find((x) => x.type === "contract_exists")!;
  assert.equal(c.verdict, "unsupported");
  assert.equal(c.reason, "record_not_found");
  assert.deepEqual(c.evidence_ids, []);
});

test("C4: contradicted (source says otherwise) and unsupported (no source) are distinct", () => {
  const contradicted = receipt(24).claims.find((x) => x.type === "po_amount")!;
  assert.equal(contradicted.verdict, "contradicted");
  const unsupported = receipt(53).claims.find((x) => x.type === "supplier_iso_certified")!;
  assert.equal(unsupported.verdict, "unsupported");
  assert.equal(unsupported.reason, "field_missing");
});

test("A3: every verified verdict cites an evidence ID that resolves to a real record", () => {
  for (const r of receipts) {
    for (const c of r.claims) {
      if (c.verdict === "verified") assert.ok(c.evidence_ids.length > 0, `${c.id} verified without evidence`);
      for (const id of c.evidence_ids) assert.ok(findEvidence(db, decisions, id), `${c.id} cites unknown ${id}`);
    }
  }
});

test("A2: every verdict is set by code", () => {
  assert.ok(receipts.flatMap((r) => r.claims).every((c) => c.checked_by === "code"));
});

test("edge #9: cert that expires 2 days after the decision is verified", () => {
  assert.equal(receipt(9).status, "verified");
});

test("edge #33: contract valid until the decision day (inclusive) is verified", () => {
  const c = receipt(33).claims.find((x) => x.type === "contract_valid")!;
  assert.equal(c.verdict, "verified");
});

test("edge #12: order equal to the available budget is verified", () => {
  assert.equal(receipt(12).claims.find((x) => x.type === "budget_available")!.verdict, "verified");
});

test("cross-decision: #19 completes a split with #18 (POL-APPROVAL-01), #18 itself is fine", () => {
  const p19 = receipt(19).claims.find((x) => x.type === "policy_no_split")!;
  assert.equal(p19.verdict, "contradicted");
  assert.ok(p19.evidence_ids.includes("D-018"));
  assert.equal(receipt(18).claims.find((x) => x.type === "policy_no_split")!.verdict, "verified");
});

test("A1: AI off, text-only logs are unverifiable, not verified", () => {
  for (const n of [31, 35, 38, 41]) assert.equal(receipt(n).status, "unverifiable");
});

test("German amount format from a model claim is compared as a number", () => {
  const d = byNo(16);
  const po = db.purchaseOrders.get("PO-4516")!;
  const r = verifyClaim(claim({ type: "po_amount", quote: "x", params: { po_id: "PO-4516", amount_eur: po.amount_eur } }), d, db);
  assert.equal(r.verdict, "verified");
});

test("A4: schema rejects invented claim types and extra keys", () => {
  assert.equal(ExtractionOutputSchema.safeParse({ claims: [{ type: "supplier_trustworthy", quote: "abc", params: {} }] }).success, false);
  assert.equal(ExtractionOutputSchema.safeParse({ claims: [{ type: "po_exists", quote: "abc", params: { po_id: "PO-1", verdict: "verified" } }] }).success, false);
  assert.equal(ExtractionOutputSchema.safeParse({ claims: [{ type: "po_exists", quote: "PO-4514", params: { po_id: "PO-4514" } }] }).success, true);
});

test("merge: a model claim identical to a tool-call claim is dropped, a conflicting one is kept", () => {
  const d = byNo(14);
  const tool: Claim[] = [{ id: "a", source: "tool_call", type: "po_amount", quote: "q", params: { po_id: "PO-4514", amount_eur: 8400 } }];
  const same: Claim[] = [{ id: "b", source: "llm", type: "po_amount", quote: "q", params: { amount_eur: 8400, po_id: "PO-4514" } }];
  const diff: Claim[] = [{ id: "c", source: "llm", type: "po_amount", quote: "q", params: { po_id: "PO-4514", amount_eur: 840 } }];
  assert.equal(mergeClaims(tool, same).length, 1);
  assert.equal(mergeClaims(tool, diff).length, 2);
  void d;
});

console.log(`\n${passed} tests passed`);

// ---- provider selection (bring your own key) ----
import { resolveProvider } from "@/lib/receipts/providers";
{
  const saved = { ...process.env };
  const keys = ["LLM_PROVIDER", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "LANGDOCK_API_KEY", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "MODEL_A", "OPENAI_BASE_URL"];
  for (const k of keys) delete process.env[k];
  test("BYOK: with only an Anthropic key, Anthropic is picked automatically", () => {
    process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
    const r = resolveProvider();
    assert.equal(r.spec.id, "anthropic");
    assert.equal(r.spec.protocol, "anthropic");
    delete process.env.ANTHROPIC_API_KEY;
  });
  test("BYOK: custom provider needs a base URL; Ollama needs no key", () => {
    process.env.LLM_PROVIDER = "custom";
    process.env.LLM_API_KEY = "test-not-a-real-key";
    assert.throws(() => resolveProvider(), /LLM_BASE_URL/);
    process.env.LLM_BASE_URL = "http://localhost:9999/v1/";
    assert.equal(resolveProvider().baseUrl, "http://localhost:9999/v1");
    process.env.LLM_PROVIDER = "ollama";
    delete process.env.LLM_BASE_URL;
    assert.equal(resolveProvider().apiKey, null);
  });
  test("BYOK: no key at all gives a clear error", () => {
    for (const k of keys) delete process.env[k];
    assert.throws(() => resolveProvider(), /No API key found/);
  });
  Object.assign(process.env, saved);
  console.log(`${passed} tests passed (incl. provider selection)`);
}
