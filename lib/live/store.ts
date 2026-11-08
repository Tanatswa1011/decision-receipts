/**
 * Local telemetry store (no database).
 *   runs/live/events.jsonl  accepted events, one JSON line each: { received_at, event }
 *   runs/live/log.jsonl     every ingest attempt: accepted | duplicate | rejected (+ reason)
 * Git-ignored via runs/live/.gitignore. "Reset live data" deletes only this folder.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IngestEvent } from "@/lib/contracts/ingest-event";
import { PUBLIC_DEMO } from "@/lib/demo";

export const LIVE_DIR =
  process.env.DR_LIVE_DIR ?? (PUBLIC_DEMO ? join(process.cwd(), "data", "live-snapshot") : join(process.cwd(), "runs", "live"));
const EVENTS = join(LIVE_DIR, "events.jsonl");
const LOG = join(LIVE_DIR, "log.jsonl");

export type StoredEvent = { received_at: string; event: IngestEvent };
export type LogEntry = {
  at: string;
  outcome: "accepted" | "duplicate" | "rejected";
  status: number;
  event_id: string | null;
  run_id: string | null;
  code?: string;
  reason?: string;
};

function ensureDir() {
  if (!existsSync(LIVE_DIR)) {
    mkdirSync(LIVE_DIR, { recursive: true });
    writeFileSync(join(LIVE_DIR, ".gitignore"), "*\n");
  }
}

function readLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return []; // a torn last line from a crash is skipped, not fatal
      }
    });
}

export function readEvents(): StoredEvent[] {
  return readLines<StoredEvent>(EVENTS);
}

export function readLog(): LogEntry[] {
  return readLines<LogEntry>(LOG);
}

export function hasEvent(eventId: string): boolean {
  return readEvents().some((e) => e.event.event_id === eventId);
}

export function appendEvent(event: IngestEvent): StoredEvent {
  if (PUBLIC_DEMO) throw new Error("read-only demo");
  ensureDir();
  const stored = { received_at: new Date().toISOString(), event };
  appendFileSync(EVENTS, JSON.stringify(stored) + "\n");
  return stored;
}

export function appendLog(entry: Omit<LogEntry, "at">) {
  if (PUBLIC_DEMO) return;
  ensureDir();
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

export function liveStats() {
  const log = readLog();
  const events = readEvents();
  const count = (o: LogEntry["outcome"]) => log.filter((l) => l.outcome === o).length;
  return {
    events: events.length,
    runs: new Set(events.map((e) => e.event.external_run_id)).size,
    accepted: count("accepted"),
    duplicate: count("duplicate"),
    rejected: count("rejected"),
    last_event_at: events.at(-1)?.received_at ?? null,
    recent_rejections: log.filter((l) => l.outcome === "rejected").slice(-5).reverse(),
  };
}

export function resetLive() {
  if (PUBLIC_DEMO) return;
  if (existsSync(LIVE_DIR)) rmSync(LIVE_DIR, { recursive: true, force: true });
}
