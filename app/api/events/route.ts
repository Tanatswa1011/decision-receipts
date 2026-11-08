/**
 * POST /api/events: telemetry ingest, same contract and status codes as ACPT's
 * /api/events (ingest-event.ts copied unchanged), minus the database and tenancy:
 *   201 accepted · 200 duplicate (same event_id) · 400 invalid body · 401 bad/missing key
 * On `run.completed` the decision is verified straight away and the receipt status is
 * returned, so a caller can measure ingest → receipt latency.
 */
import { NextResponse } from "next/server";
import { ingestEventSchema } from "@/lib/contracts/ingest-event";
import { checkBearer } from "@/lib/live/ingest-key";
import { receiptForRun } from "@/lib/live/adapter";
import { appendEvent, appendLog, hasEvent } from "@/lib/live/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const started = performance.now();
  if (!checkBearer(request.headers.get("authorization"))) {
    appendLog({ outcome: "rejected", status: 401, event_id: null, run_id: null, code: "unauthorized", reason: "Missing or wrong ingest key" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    appendLog({ outcome: "rejected", status: 400, event_id: null, run_id: null, code: "invalid_body", reason: "Body is not JSON" });
    return NextResponse.json({ error: "invalid_body", details: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = ingestEventSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const raw = body as Record<string, unknown> | null;
    appendLog({
      outcome: "rejected",
      status: 400,
      event_id: typeof raw?.event_id === "string" ? raw.event_id : null,
      run_id: typeof raw?.external_run_id === "string" ? raw.external_run_id : null,
      code: "invalid_body",
      reason: details.slice(0, 3).map((d) => `${d.path || "(root)"}: ${d.message}`).join("; "),
    });
    return NextResponse.json({ error: "invalid_body", details }, { status: 400 });
  }

  const event = parsed.data;
  if (hasEvent(event.event_id)) {
    appendLog({ outcome: "duplicate", status: 200, event_id: event.event_id, run_id: event.external_run_id });
    return NextResponse.json({ outcome: "duplicate", event_id: event.event_id, duplicate: true }, { status: 200 });
  }

  appendEvent(event);
  appendLog({ outcome: "accepted", status: 201, event_id: event.event_id, run_id: event.external_run_id });

  let receipt: ReturnType<typeof receiptForRun> = null;
  if (event.event_type === "run.completed") receipt = receiptForRun(event.external_run_id);

  return NextResponse.json(
    {
      outcome: "accepted",
      event_id: event.event_id,
      duplicate: false,
      run_id: event.external_run_id,
      receipt,
      server_ms: Math.round((performance.now() - started) * 100) / 100,
    },
    { status: 201 },
  );
}
