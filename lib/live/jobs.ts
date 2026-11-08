/**
 * Background jobs started from the UI (replay, built-in agent). One job at a time.
 * State lives on globalThis so server actions and route handlers see the same job.
 */
import { loadRequests, runAgentOnRequest, type AgentRunResult } from "@/lib/agent/procurement-agent";
import { makeEmitter } from "@/lib/live/emit";
import { replayDecisions, type ReplayResult } from "@/lib/live/replay";
import { llmConfigFromEnv } from "@/lib/receipts/llm";

export type Job = {
  kind: "replay" | "agent";
  running: boolean;
  done: number;
  total: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  summary: string | null;
};

const g = globalThis as unknown as { __drJob?: Job };

export function currentJob(): Job | null {
  return g.__drJob ?? null;
}

function begin(kind: Job["kind"], total: number): Job {
  if (g.__drJob?.running) throw new Error(`A ${g.__drJob.kind} is already running.`);
  g.__drJob = { kind, running: true, done: 0, total, started_at: new Date().toISOString(), finished_at: null, error: null, summary: null };
  return g.__drJob;
}

function finish(job: Job, summary: string | null, error: string | null) {
  job.running = false;
  job.finished_at = new Date().toISOString();
  job.summary = summary;
  job.error = error;
}

export function startReplay(baseUrl: string, delayMs = 250): Job {
  const job = begin("replay", 60);
  makeEmitter(baseUrl); // fail fast if there's no ingest key
  process.env.DR_APP_URL = baseUrl;
  replayDecisions({ delayMs, onProgress: (d, t) => { job.done = d; job.total = t; } })
    .then((r: ReplayResult) => finish(job, `${r.runs} runs: ${r.accepted} events accepted, ${r.duplicates} duplicates, ${r.flagged} flagged.`, null))
    .catch((e) => finish(job, null, (e as Error).message));
  return job;
}

export function startAgent(baseUrl: string): Job {
  const cfg = llmConfigFromEnv(); // throws a clear message if no key is saved
  const requests = loadRequests();
  const job = begin("agent", requests.length);
  const emitter = makeEmitter(baseUrl);
  (async () => {
    const results: AgentRunResult[] = [];
    for (const req of requests) {
      results.push(await runAgentOnRequest(req, cfg, emitter));
      job.done = results.length;
    }
    const flagged = results.filter((r) => r.receipt?.status === "flagged").length;
    const failed = results.filter((r) => r.error).length;
    finish(job, `${cfg.model}: ${results.length} requests, ${results.filter((r) => r.decision === "approve").length} approved, ${flagged} receipts flagged${failed ? `, ${failed} runs failed` : ""}.`, null);
  })().catch((e) => finish(job, null, (e as Error).message));
  return job;
}
