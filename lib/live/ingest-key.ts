/**
 * Ingest key for POST /api/events (the role ACPT's acpt_live_* connection key played).
 * Kept server-side only: process env + git-ignored .env.local, so the agent and replay
 * scripts can read it too. The UI only ever sees a masked form, except once right after
 * generating, so it can be copied into an external agent.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_DEMO } from "@/lib/demo";

const ENV_LOCAL = process.env.DR_ENV_LOCAL ?? join(process.cwd(), ".env.local");
const NAME = "DR_INGEST_KEY";

export function currentIngestKey(): string | null {
  if (PUBLIC_DEMO) return null;
  if (process.env[NAME]) return process.env[NAME]!;
  if (existsSync(ENV_LOCAL)) {
    const line = readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${NAME}=`));
    const value = line?.slice(NAME.length + 1).trim();
    if (value) {
      process.env[NAME] = value;
      return value;
    }
  }
  return null;
}

export function rotateIngestKey(): string {
  if (PUBLIC_DEMO) throw new Error("read-only demo");
  const key = `dr_live_${randomBytes(24).toString("base64url")}`;
  const lines = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith(`${NAME}=`)) : [];
  lines.push(`${NAME}=${key}`);
  writeFileSync(ENV_LOCAL, lines.join("\n") + "\n", { mode: 0o600 });
  process.env[NAME] = key;
  return key;
}

export function maskedIngestKey(): string | null {
  const key = currentIngestKey();
  return key ? `dr_live_••••${key.slice(-4)}` : null;
}

/** Constant-time check of an Authorization header. */
export function checkBearer(header: string | null): boolean {
  const key = currentIngestKey();
  if (!key || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7).trim());
  const expected = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
