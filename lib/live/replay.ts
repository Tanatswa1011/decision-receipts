/**
 * Replay: streams the 60 synthetic decisions into /api/events as telemetry runs.
 * Free, needs no LLM key, and gives the same result every time (the Loom safety net).
 * Run ids are fixed (replay-D-014 …), so replaying twice is idempotent: every event comes
 * back as a duplicate, which is the de-duplication working.
 */
import { DECISION_ACTIONS } from "@/lib/live/adapter";
import { lifecycle, makeEmitter, step } from "@/lib/live/emit";
import { loadDecisions } from "@/lib/receipts/data";

const ACTION_OUT = Object.fromEntries(Object.entries(DECISION_ACTIONS).map(([k, v]) => [v, k]));

export type ReplayResult = {
  runs: number;
  accepted: number;
  duplicates: number;
  flagged: number;
  receipt_latency_ms: number[]; // client round trip of each run.completed POST (ingest -> verified receipt)
};

export async function replayDecisions(opts: { delayMs?: number; limit?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<ReplayResult> {
  const emitter = makeEmitter();
  const decisions = loadDecisions().slice(0, opts.limit ?? undefined);
  const result: ReplayResult = { runs: 0, accepted: 0, duplicates: 0, flagged: 0, receipt_latency_ms: [] };
  for (const [i, d] of decisions.entries()) {
    const base = { agent_id: d.tool_call ? "procure-agent-v2.3" : "procure-agent-v1.8-legacy", external_run_id: `replay-${d.id}` };
    const meta = { source: "replay", decision_id: d.id, receipt_no: d.receipt_no };
    const events = [
      lifecycle(base, "run.started", 0, meta, d.timestamp),
      step(base, 1, {
        tool: "procurement",
        action: ACTION_OUT[d.action]!,
        resource_id: d.tool_call?.po_id ?? `decision:${d.id}`,
        after_state: d.tool_call ? { ...d.tool_call } : null,
        risk_metadata: { ...meta, rationale: d.rationale },
        timestamp: d.timestamp,
      }),
      lifecycle(base, "run.completed", 2, meta, d.timestamp),
    ];
    for (const event of events) {
      const res = await emitter.send(event);
      if (res.status === 201) result.accepted += 1;
      else result.duplicates += 1;
      if (event.event_type === "run.completed" && res.status === 201) {
        result.receipt_latency_ms.push(res.ms);
        if (res.body?.receipt?.status === "flagged") result.flagged += 1;
      }
    }
    result.runs += 1;
    opts.onProgress?.(i + 1, decisions.length);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  return result;
}
