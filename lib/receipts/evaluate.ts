/**
 * Shared by `npm run eval` and the Settings page. Scores every run in runs/ against labels/ground-truth.json and writes
 * runs/metrics.json + docs/results.md. Numbers here come only from run files.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaimResult } from "@/lib/receipts/claims";
import { loadDecisions, loadGroundTruth, loadSystems } from "@/lib/receipts/data";
import { buildReceipts, reviewQueue, type Receipt } from "@/lib/receipts/pipeline";
import type { Claim } from "@/lib/receipts/claims";

type RunFile = {
  summary: Record<string, unknown> & { mode: string; model: string | null; tokens: { prompt: number; completion: number } | null; llm_latency_ms: { mean: number; p50: number; max: number } | null };
  receipts: Array<Omit<Receipt, "decision"> & { decision_id: string }>;
  extraction: Array<{ decision_id: string; ok: boolean; claims: Array<{ type: string; params: Record<string, unknown> }>; rejected_output: unknown; rejected_claims: unknown[] }>;
};

type Prices = Record<string, { input_usd_per_mtok: number; output_usd_per_mtok: number; source: string }>;

export function evaluateAll(): { markdown: string } {
const ROOT = process.cwd();
const db = loadSystems();
const decisions = loadDecisions();
const truth = new Map(loadGroundTruth().map((g) => [g.decision_id, g]));
const BAD = [...truth.values()].filter((g) => g.label_pass1 === "bad").length;
const N = decisions.length;
const K = 10;

const pricesPath = join(ROOT, "config", "prices.json");
const prices: Prices = existsSync(pricesPath) ? JSON.parse(readFileSync(pricesPath, "utf8")).models ?? {} : {};
const eurPerUsd: number | null = existsSync(pricesPath) ? JSON.parse(readFileSync(pricesPath, "utf8")).eur_per_usd ?? null : null;

// seeded PRNG for the random-review baseline
let s = 42;
function rand() {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomBaseline(trials = 10000) {
  const labels = decisions.map((d) => truth.get(d.id)!.label_pass1 === "bad");
  const hits: number[] = [];
  for (let t = 0; t < trials; t += 1) {
    const idx = labels.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    hits.push(idx.slice(0, K).filter((i) => labels[i]).length);
  }
  const mean = hits.reduce((a, b) => a + b, 0) / trials;
  return { mean, analytic: (K * BAD) / N, trials, p_at_least_7: hits.filter((h) => h >= 7).length / trials };
}

function amountOnlyBaseline() {
  // Review the biggest orders first, with no verification at all.
  const ranked = [...decisions].sort((a, b) => {
    const pa = db.purchaseOrders.get(a.tool_call?.po_id ?? `PO-${4500 + a.receipt_no}`)?.amount_eur ?? 0;
    const pb = db.purchaseOrders.get(b.tool_call?.po_id ?? `PO-${4500 + b.receipt_no}`)?.amount_eur ?? 0;
    return pb - pa;
  });
  return ranked.slice(0, K).filter((d) => truth.get(d.id)!.label_pass1 === "bad").length;
}

function goldClaims(): Map<string, Array<{ type: string; params: Record<string, unknown> }>> {
  const rows = JSON.parse(readFileSync(join(ROOT, "labels", "gold-claims.json"), "utf8")) as Array<{ decision_id: string; claims: Array<{ type: string; params: Record<string, unknown> }> }>;
  return new Map(rows.map((r) => [r.decision_id, r.claims]));
}

function sameClaim(a: { type: string; params: Record<string, unknown> }, b: { type: string; params: Record<string, unknown> }) {
  if (a.type !== b.type) return false;
  const keys = Object.keys(b.params);
  return keys.every((k) => {
    const x = a.params[k];
    const y = b.params[k];
    if (typeof y === "number") return typeof x === "number" && Math.abs(x - y) < 0.005;
    return String(x).trim().toUpperCase() === String(y).trim().toUpperCase();
  });
}

function score(file: string, run: RunFile) {
  // Rebuild receipts with the CURRENT verifier from the saved model claims, so a code change
  // is scored without calling the model again. The model's output itself is never re-generated.
  const modelClaims = run.summary.mode === "llm" ? new Map<string, Claim[]>(run.extraction.map((e) => [e.decision_id, e.claims as unknown as Claim[]])) : undefined;
  const receipts: Receipt[] = buildReceipts({ decisions, db, modelClaims });
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const missed: number[] = [];
  const falseFlags: number[] = [];
  const byDefect: Record<string, { planted: number; caught: number }> = {};
  for (const r of receipts) {
    const g = truth.get(r.decision.id)!;
    const bad = g.label_pass1 === "bad";
    const flagged = r.status === "flagged";
    if (bad) {
      byDefect[g.defect_type!] ??= { planted: 0, caught: 0 };
      byDefect[g.defect_type!]!.planted += 1;
      if (flagged) byDefect[g.defect_type!]!.caught += 1;
    }
    if (bad && flagged) tp += 1;
    else if (!bad && flagged) { fp += 1; falseFlags.push(r.decision.receipt_no); }
    else if (bad && !flagged) { fn += 1; missed.push(r.decision.receipt_no); }
    else tn += 1;
  }
  const queue = reviewQueue(receipts, db);
  const first10 = queue.slice(0, K);
  const queueHits = first10.filter((r) => truth.get(r.decision.id)!.label_pass1 === "bad").length;
  const eurCaught = receipts.filter((r) => r.status === "flagged" && truth.get(r.decision.id)!.label_pass1 === "bad").reduce((a, r) => a + r.eur_at_risk, 0);

  const allClaims: ClaimResult[] = receipts.flatMap((r) => r.claims);
  const verdictsByCode = allClaims.filter((c) => c.checked_by === "code").length;

  // Extraction quality vs gold claims (AI-on runs only)
  let extraction: null | { gold: number; matched: number; recall: number; extra_checkable: number; precision: number } = null;
  if (run.summary.mode === "llm") {
    const gold = goldClaims();
    let goldN = 0, matched = 0, predicted = 0, correctPred = 0;
    for (const e of run.extraction) {
      const g = gold.get(e.decision_id) ?? [];
      const pred = e.claims.filter((c) => c.type !== "out_of_scope");
      goldN += g.length;
      matched += g.filter((gc) => pred.some((p) => sameClaim(p, gc))).length;
      predicted += pred.length;
      correctPred += pred.filter((p) => g.some((gc) => sameClaim(p, gc))).length;
    }
    extraction = { gold: goldN, matched, recall: goldN ? matched / goldN : 0, extra_checkable: predicted - correctPred, precision: predicted ? correctPred / predicted : 0 };
  }

  const price = run.summary.model ? prices[run.summary.model] : undefined;
  const tokens = run.summary.tokens;
  const usd = price && tokens ? (tokens.prompt * price.input_usd_per_mtok + tokens.completion * price.output_usd_per_mtok) / 1e6 : null;

  return {
    file,
    mode: run.summary.mode,
    model: run.summary.model,
    decisions: receipts.length,
    flagged: tp + fp,
    tp, fp, fn, tn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp / (tp + fn),
    missed_receipts: missed,
    false_flag_receipts: falseFlags,
    by_defect: byDefect,
    unverifiable: receipts.filter((r) => r.status === "unverifiable").length,
    queue_first10_bad: queueHits,
    queue_first10_receipts: first10.map((r) => r.decision.receipt_no),
    eur_at_risk_caught: eurCaught,
    verdicts_total: allClaims.length,
    verdicts_by_code: verdictsByCode,
    verdicts_by_model: allClaims.length - verdictsByCode,
    contradicted: allClaims.filter((c) => c.verdict === "contradicted").length,
    unsupported: allClaims.filter((c) => c.verdict === "unsupported").length,
    rejected_model_outputs: run.summary.rejected_model_outputs,
    rejected_model_claims: run.summary.rejected_model_claims,
    extraction,
    tokens,
    tokens_per_decision: tokens ? (tokens.prompt + tokens.completion) / receipts.length : null,
    usd_total: usd,
    usd_per_decision: usd == null ? null : usd / receipts.length,
    eur_per_decision: usd == null || eurPerUsd == null ? null : (usd * eurPerUsd) / receipts.length,
    price_source: price?.source ?? null,
    llm_latency_ms: run.summary.llm_latency_ms,
    verify_ms_per_decision: Number(run.summary.verify_ms_total) / receipts.length,
  };
}

  const runFiles = readdirSync(join(ROOT, "runs")).filter((f) => f.endsWith(".json") && f !== "metrics.json");
const results = runFiles.map((f) => score(f, JSON.parse(readFileSync(join(ROOT, "runs", f), "utf8")) as RunFile));
const baseline = { random: randomBaseline(), amount_only_first10_bad: amountOnlyBaseline(), labelled: N, bad: BAD, k: K };
writeFileSync(join(ROOT, "runs", "metrics.json"), JSON.stringify({ generated_at: new Date().toISOString(), baseline, results }, null, 2));

const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const lines: string[] = [];
lines.push(`# Measured results`, ``, `Generated by \`npm run eval\` at ${new Date().toISOString()} from the run files in \`runs/\`. Do not edit by hand.`, ``);
lines.push(`Labelled set: N = ${N} decisions, ${BAD} bad (label pass 1). Review budget: first ${K} reviews.`, ``);
lines.push(`| Run | Precision | Recall | TP/FP/FN | Unverifiable | Bad in first ${K} of queue | Rejected outputs / claims | Tokens per decision | Cost per decision | LLM latency p50 / mean |`);
lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
for (const r of results) {
  lines.push(
    `| ${r.mode === "llm" ? `AI on (${r.model})` : "AI off (code only)"} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.tp}/${r.fp}/${r.fn} | ${r.unverifiable} | ${r.queue_first10_bad} of ${BAD} | ${r.rejected_model_outputs} / ${r.rejected_model_claims} | ${r.tokens_per_decision?.toFixed(0) ?? "0"} | ${r.eur_per_decision != null ? `€${r.eur_per_decision.toFixed(5)}` : r.usd_per_decision != null ? `$${r.usd_per_decision.toFixed(5)}` : "€0 (no model)"} | ${r.llm_latency_ms ? `${(r.llm_latency_ms.p50 / 1000).toFixed(2)} s / ${(r.llm_latency_ms.mean / 1000).toFixed(2)} s` : `${r.verify_ms_per_decision.toFixed(2)} ms (code only)`} |`,
  );
}
lines.push(``, `Baselines for the first ${K} reviews: random spot checks find ${baseline.random.mean.toFixed(2)} of ${BAD} on average (analytic ${baseline.random.analytic.toFixed(2)}, ${baseline.random.trials} seeded shuffles; P(≥7) = ${baseline.random.p_at_least_7.toFixed(4)}). Reviewing the ${K} largest orders with no verification finds ${baseline.amount_only_first10_bad} of ${BAD}.`, ``);
for (const r of results) {
  lines.push(`## ${r.mode === "llm" ? `AI on (${r.model})` : "AI off (code only)"}`);
  lines.push(`- Verdicts: ${r.verdicts_total} total, ${r.verdicts_by_code} set by code, ${r.verdicts_by_model} by a model (${pct(r.verdicts_total ? r.verdicts_by_code / r.verdicts_total : null)} code). Contradicted ${r.contradicted}, unsupported ${r.unsupported}.`);
  lines.push(`- Missed bad receipts: ${r.missed_receipts.length ? r.missed_receipts.map((n) => `#${n}`).join(", ") : "none"}. False flags: ${r.false_flag_receipts.length ? r.false_flag_receipts.map((n) => `#${n}`).join(", ") : "none"}.`);
  lines.push(`- By defect: ${Object.entries(r.by_defect).map(([k, v]) => `${k} ${v.caught}/${v.planted}`).join(", ")}.`);
  lines.push(`- Queue first ${K}: ${r.queue_first10_receipts.map((n) => `#${n}`).join(", ")}. € at risk on caught bad decisions: €${r.eur_at_risk_caught.toLocaleString("en-US")}.`);
  if (r.extraction) lines.push(`- Claim extraction vs gold claims: recall ${pct(r.extraction.recall)} (${r.extraction.matched}/${r.extraction.gold}), precision ${pct(r.extraction.precision)}, ${r.extraction.extra_checkable} checkable claims not in gold.`);
  if (r.price_source) lines.push(`- Price source: ${r.price_source}.`);
  lines.push(``);
}
writeFileSync(join(ROOT, "docs", "results.md"), lines.join("\n"));
return { markdown: lines.join("\n") };

}
