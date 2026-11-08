/**
 * Telemetry runs -> decisions. Mapping spec: docs/TELEMETRY_MAPPING.md.
 *
 * One run (external_run_id) = one decision. The decision is the step whose action is
 * po.approve | po.reject | payment.release; its after_state holds the structured fields
 * and risk_metadata.rationale the free text. Lookup steps record what the agent saw.
 * A run becomes a receipt only once run.completed has arrived.
 */
import type { Decision } from "@/lib/receipts/data";
import { loadSystems } from "@/lib/receipts/data";
import { buildReceipts } from "@/lib/receipts/pipeline";
import { readEvents, type StoredEvent } from "@/lib/live/store";

export const DECISION_ACTIONS: Record<string, Decision["action"]> = {
  "po.approve": "approve_po",
  "po.reject": "reject_po",
  "payment.release": "release_payment",
};

export type LiveRun = {
  run_id: string;
  agent_id: string;
  events: StoredEvent[];
  state: "in_progress" | "failed" | "decision" | "unmapped";
  unmapped_actions: string[];
  decision: Decision | null;
  first_at: string;
  last_at: string;
};

/** Trim and lower-case keys (n8n sheets often carry tab-padded headers like "\tInvoice ID"). */
function normKeys(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k.trim().toLowerCase(), v]));
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  let s = v.replace(/[€$\s]|EUR|USD/gi, "");
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 8.402,75
  else s = s.replace(/,/g, ""); // 8,402.75
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

function toolCallFrom(after: Record<string, unknown>): Decision["tool_call"] {
  const po_id = str(after.po_id);
  const supplier_id = str(after.supplier_id);
  const amount = toNumber(after.amount_eur ?? after.amount);
  if (!po_id || !supplier_id || amount == null) return null; // not enough structure: treat as free text
  return {
    po_id,
    supplier_id,
    amount_eur: amount,
    cost_center: str(after.cost_center) ?? "",
    contract_id: str(after.contract_id),
    iso_certified: toBool(after.iso_certified),
    budget_available: toBool(after.budget_available),
  };
}

export function liveRuns(): LiveRun[] {
  const byRun = new Map<string, StoredEvent[]>();
  for (const e of readEvents()) {
    const list = byRun.get(e.event.external_run_id) ?? [];
    list.push(e);
    byRun.set(e.event.external_run_id, list);
  }
  let liveNo = 100;
  const runs: LiveRun[] = [];
  for (const [run_id, list] of byRun) {
    const events = [...list].sort((a, b) => a.event.sequence - b.event.sequence || a.event.timestamp.localeCompare(b.event.timestamp));
    const completed = events.find((e) => e.event.event_type === "run.completed");
    const failed = events.some((e) => e.event.event_type === "workflow.step.failed");
    const steps = events.filter((e) => e.event.event_type === "workflow.step.completed");
    const decisionStep = steps.find((e) => e.event.action && DECISION_ACTIONS[e.event.action]);
    const unmapped = steps.map((e) => e.event.action ?? "").filter((a) => a && !DECISION_ACTIONS[a] && !a.startsWith("lookup"));
    const base = { run_id, agent_id: events[0]!.event.agent_id, events, unmapped_actions: unmapped, first_at: events[0]!.received_at, last_at: events.at(-1)!.received_at };

    if (!completed) {
      runs.push({ ...base, state: failed ? "failed" : "in_progress", decision: null });
      continue;
    }
    if (failed || !decisionStep) {
      runs.push({ ...base, state: failed ? "failed" : "unmapped", decision: null });
      continue;
    }

    const ev = decisionStep.event;
    const meta = normKeys(ev.risk_metadata);
    const doneMeta = normKeys(completed.event.risk_metadata);
    const after = normKeys(ev.after_state);
    const source = (str(meta.source) ?? str(doneMeta.source) ?? "external") as NonNullable<Decision["live"]>["source"];
    const receiptNo = toNumber(meta.receipt_no);
    const agentSaw: Record<string, Record<string, unknown>> = {};
    for (const s of steps) {
      if (s !== decisionStep && s.event.resource_id && s.event.after_state) agentSaw[s.event.resource_id] = s.event.after_state as Record<string, unknown>;
    }
    const decision: Decision = {
      id: str(meta.decision_id) ?? `L-${run_id}`,
      receipt_no: receiptNo ?? ++liveNo,
      timestamp: ev.timestamp,
      agent: ev.agent_id,
      action: DECISION_ACTIONS[ev.action!]!,
      agent_log_status: ev.status === "completed" ? "success" : ev.status,
      rationale: str(meta.rationale) ?? str(doneMeta.rationale) ?? "",
      tool_call: toolCallFrom(after),
      live: { source: ["replay", "live_agent"].includes(source) ? source : "external", run_id, agent_saw: agentSaw },
    };
    runs.push({ ...base, state: "decision", decision });
  }
  return runs.sort((a, b) => a.first_at.localeCompare(b.first_at));
}

export function liveDecisions(): Decision[] {
  return liveRuns()
    .flatMap((r) => (r.decision ? [r.decision] : []))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.receipt_no - b.receipt_no);
}

/** Verify one completed run right away (used by POST /api/events on run.completed). */
export function receiptForRun(runId: string) {
  const run = liveRuns().find((r) => r.run_id === runId);
  if (!run) return null;
  if (!run.decision) return { run_state: run.state, unmapped_actions: run.unmapped_actions };
  const receipts = buildReceipts({ decisions: liveDecisions(), db: loadSystems() });
  const r = receipts.find((x) => x.decision.id === run.decision!.id)!;
  return {
    run_state: run.state,
    decision_id: r.decision.id,
    receipt_no: r.decision.receipt_no,
    status: r.status,
    eur_at_risk: r.eur_at_risk,
    failed_facts: r.counts.contradicted + r.counts.unsupported,
  };
}
