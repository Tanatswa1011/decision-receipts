/**
 * Runs the receipt pipeline over data/decisions.json and writes runs/<file>.json.
 * Shared by the CLI (scripts/run-pipeline.ts) and the in-app Settings page.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Claim } from "@/lib/receipts/claims";
import { loadDecisions, loadSystems } from "@/lib/receipts/data";
import { EXTRACTION_PROMPT_VERSION, extractClaims, llmConfigFromEnv, type ExtractionResult, type LlmConfig } from "@/lib/receipts/llm";
import { buildReceipts } from "@/lib/receipts/pipeline";

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function runPipeline(opts: {
  mode: "offline" | "llm";
  provider?: string;
  model?: string;
  cfg?: LlmConfig;
  concurrency?: number;
  log?: (msg: string) => void;
}) {
  const mode = opts.mode;
  const db = loadSystems();
  const decisions = loadDecisions();
  const startedAt = new Date().toISOString();

  let extraction: ExtractionResult[] = [];
  let model: string | null = null;
  let endpoint: string | null = null;
  let provider: string | null = null;
  const t0 = performance.now();

  if (mode === "llm") {
    const cfg = opts.cfg ?? llmConfigFromEnv({ provider: opts.provider, model: opts.model });
    model = cfg.model;
    provider = cfg.provider;
    endpoint = new URL(cfg.baseUrl).host; // host only, never the key
    opts.log?.(`Extracting claims with ${cfg.providerLabel} / ${cfg.model} via ${endpoint} (${decisions.length} decisions)...`);
    extraction = await mapLimit(decisions, opts.concurrency ?? 4, async (d) => {
      try {
        return await extractClaims(d, cfg);
      } catch (error) {
        return {
          decisionId: d.id, model: cfg.model, ok: false, claims: [], rejectedClaims: [], latencyMs: 0, usage: null,
          rejectedOutput: { raw: "", error: `request failed: ${(error as Error).message}` },
        } satisfies ExtractionResult;
      }
    });
  }

  const tVerify = performance.now();
  const modelClaims = new Map<string, Claim[]>(extraction.map((e) => [e.decisionId, e.claims]));
  const receipts = buildReceipts({ decisions, db, modelClaims: mode === "llm" ? modelClaims : undefined });
  const verifyMs = performance.now() - tVerify;

  const usage = extraction.reduce(
    (acc, e) => ({ prompt: acc.prompt + (e.usage?.prompt_tokens ?? 0), completion: acc.completion + (e.usage?.completion_tokens ?? 0) }),
    { prompt: 0, completion: 0 },
  );
  const latencies = extraction.filter((e) => e.latencyMs > 0).map((e) => e.latencyMs).sort((a, b) => a - b);
  const summary = {
    mode,
    provider,
    model,
    endpoint,
    prompt_version: mode === "llm" ? EXTRACTION_PROMPT_VERSION : null,
    started_at: startedAt,
    decisions: decisions.length,
    flagged: receipts.filter((r) => r.status === "flagged").length,
    verified: receipts.filter((r) => r.status === "verified").length,
    unverifiable: receipts.filter((r) => r.status === "unverifiable").length,
    claims_total: receipts.reduce((n, r) => n + r.claims.length, 0),
    claims_by_source: receipts.flatMap((r) => r.claims).reduce<Record<string, number>>((acc, c) => ((acc[c.source] = (acc[c.source] ?? 0) + 1), acc), {}),
    verdicts_by_code: receipts.flatMap((r) => r.claims).filter((c) => c.checked_by === "code").length,
    rejected_model_outputs: extraction.filter((e) => !e.ok).length,
    rejected_model_claims: extraction.reduce((n, e) => n + e.rejectedClaims.length, 0),
    tokens: mode === "llm" ? usage : null,
    llm_latency_ms: latencies.length
      ? { mean: latencies.reduce((a, b) => a + b, 0) / latencies.length, p50: latencies[Math.floor(latencies.length / 2)]!, max: latencies[latencies.length - 1]! }
      : null,
    verify_ms_total: verifyMs,
    wall_ms_total: performance.now() - t0,
  };

  const file = mode === "llm" ? `llm-${provider}-${model!.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json` : "offline.json";
  mkdirSync(join(process.cwd(), "runs"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "runs", file),
    JSON.stringify(
      {
        summary,
        receipts: receipts.map((r) => ({ ...r, decision: undefined, decision_id: r.decision.id })),
        extraction: extraction.map((e) => ({
          decision_id: e.decisionId, ok: e.ok, latency_ms: e.latencyMs, usage: e.usage,
          claims: e.claims, rejected_output: e.rejectedOutput, rejected_claims: e.rejectedClaims,
        })),
      },
      null,
      2,
    ),
  );
  return { file, summary };
}
