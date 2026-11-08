/**
 * Telemetry sender used by the replay script and the built-in agent. It posts over
 * HTTP to /api/events exactly like the n8n HTTP Request nodes did in ACPT, so the
 * ingest boundary is the same one an external agent uses.
 */
import type { IngestEvent } from "@/lib/contracts/ingest-event";
import { currentIngestKey } from "@/lib/live/ingest-key";

export type Emitter = {
  send: (event: IngestEvent) => Promise<{ status: number; body: any; ms: number }>;
};

export function appUrl(): string {
  return (process.env.DR_APP_URL?.trim() || "http://127.0.0.1:3100").replace(/\/+$/, "");
}

export function makeEmitter(baseUrl = appUrl()): Emitter {
  const key = currentIngestKey();
  if (!key) throw new Error("No ingest key yet. Generate one in Settings → Sources (or run the app once and click Generate).");
  return {
    async send(event) {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/events`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error(`Could not reach ${baseUrl}/api/events. Is the app running (npm run dev)?`);
      }
      const body = await response.json().catch(() => null);
      const ms = performance.now() - started;
      if (response.status >= 400) throw new Error(`Ingest rejected (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
      return { status: response.status, body, ms };
    },
  };
}

type Base = Pick<IngestEvent, "agent_id" | "external_run_id">;

export function lifecycle(base: Base, type: "run.started" | "run.completed", sequence: number, meta: Record<string, unknown> = {}, timestamp = new Date().toISOString()): IngestEvent {
  return {
    ...base,
    event_id: `${base.external_run_id}-${type === "run.started" ? "started" : "completed"}`,
    event_type: type,
    sequence,
    timestamp,
    status: type === "run.started" ? "started" : "completed",
    tool: null,
    action: null,
    resource_id: null,
    before_state: null,
    after_state: null,
    risk_metadata: meta,
  };
}

export function step(
  base: Base,
  sequence: number,
  fields: { tool: string; action: string; resource_id: string; after_state: Record<string, unknown> | null; risk_metadata?: Record<string, unknown>; failed?: boolean; timestamp?: string },
): IngestEvent {
  return {
    ...base,
    event_id: `${base.external_run_id}-s${sequence}`,
    event_type: fields.failed ? "workflow.step.failed" : "workflow.step.completed",
    sequence,
    timestamp: fields.timestamp ?? new Date().toISOString(),
    status: fields.failed ? "failed" : "completed",
    tool: fields.tool,
    action: fields.action,
    resource_id: fields.resource_id,
    before_state: null,
    after_state: fields.after_state,
    risk_metadata: fields.risk_metadata ?? {},
  };
}
