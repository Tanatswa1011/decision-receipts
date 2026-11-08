/**
 * UI data access. AI-off receipts are recomputed live on every request (pure code,
 * no model). AI-on receipts come from a saved run file, because the model call
 * happened in `npm run run:llm`; the verdicts inside were still set by code.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Claim } from "@/lib/receipts/claims";
import { loadDecisions, loadGroundTruth, loadSystems } from "@/lib/receipts/data";
import { buildReceipts, reviewQueue, type Receipt } from "@/lib/receipts/pipeline";
import { liveDecisions } from "@/lib/live/adapter";

/** "file" = the labelled synthetic log (data/decisions.json); "live" = decisions that arrived as telemetry. */
export type DataSource = "file" | "live";

export type RunView = {
  key: string; // "off" or run file name
  source: DataSource;
  label: string;
  receipts: Receipt[];
  summary: { rejected_model_outputs: number; rejected_model_claims: number; model: string | null; started_at: string | null };
  metrics: Record<string, any> | null;
  rejected: Array<{ decision_id: string; error: string; raw: string }>;
};

const RUNS = join(process.cwd(), "runs");

export function llmRunFiles(): string[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS).filter((f) => f.startsWith("llm-") && f.endsWith(".json")).sort();
}

function metricsFor(file: string): Record<string, any> | null {
  const path = join(RUNS, "metrics.json");
  if (!existsSync(path)) return null;
  const m = JSON.parse(readFileSync(path, "utf8"));
  return m.results.find((r: any) => r.file === file) ?? null;
}

export function baselineMetrics(): Record<string, any> | null {
  const path = join(RUNS, "metrics.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).baseline : null;
}

export function loadRun(key: string | undefined, source: DataSource = "file"): RunView {
  const db = loadSystems();
  const decisions = source === "live" ? liveDecisions() : loadDecisions();
  const files = llmRunFiles();
  if (key && key !== "off" && files.includes(key)) {
    const run = JSON.parse(readFileSync(join(RUNS, key), "utf8"));
    // Rebuild receipts from the saved model claims so verdicts reflect the current code.
    const modelClaims = new Map<string, Claim[]>(run.extraction.map((e: any) => [e.decision_id, e.claims]));
    return {
      key,
      source,
      label: `AI on · ${run.summary.provider ?? "openai"} / ${run.summary.model}`,
      receipts: buildReceipts({ decisions, db, modelClaims }),
      summary: {
        rejected_model_outputs: run.summary.rejected_model_outputs,
        rejected_model_claims: run.summary.rejected_model_claims,
        model: run.summary.model,
        started_at: run.summary.started_at,
      },
      metrics: metricsFor(key),
      rejected: run.extraction
        .filter((e: any) => !e.ok)
        .map((e: any) => ({ decision_id: e.decision_id, error: e.rejected_output?.error ?? "", raw: e.rejected_output?.raw ?? "" })),
    };
  }
  return {
    key: "off",
    source,
    label: "AI off · code only",
    receipts: buildReceipts({ decisions, db }),
    summary: { rejected_model_outputs: 0, rejected_model_claims: 0, model: null, started_at: null },
    metrics: metricsFor("offline.json"),
    rejected: [],
  };
}

export function queueFor(run: RunView): Receipt[] {
  return reviewQueue(run.receipts, loadSystems());
}

export function truthFor(decisionId: string) {
  return loadGroundTruth().find((g) => g.decision_id === decisionId) ?? null;
}

export function eur(n: number): string {
  return `€${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** PO and supplier the receipt actually knows about (tool call or extracted claims; never guessed). */
export function receiptRefs(r: Receipt, db: ReturnType<typeof loadSystems>) {
  const poId = r.decision.tool_call?.po_id ?? (r.claims.find((c) => "po_id" in c.params)?.params as { po_id?: string } | undefined)?.po_id;
  const po = poId ? db.purchaseOrders.get(poId) : undefined;
  const supplierId =
    r.decision.tool_call?.supplier_id ?? (r.claims.find((c) => "supplier_id" in c.params)?.params as { supplier_id?: string } | undefined)?.supplier_id ?? po?.supplier_id;
  return { poId: poId ?? null, po: po ?? null, supplier: supplierId ? db.suppliers.get(supplierId) ?? null : null, supplierId: supplierId ?? null };
}
