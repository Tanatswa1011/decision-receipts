/**
 * Conservative type normalization for verification comparisons.
 * If a value cannot be safely normalized, returns null (insufficient, not a guess).
 */

export type ComparableKind = "string" | "number" | "boolean" | "instant" | "email";

export type NormalizedValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "instant"; value: number }
  | { kind: "email"; value: string };

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return null;
  const raw = asTrimmedString(value);
  if (raw == null || raw.length === 0) return null;
  const cleaned = raw.replace(/[^0-9eE.+-]/g, "");
  if (!cleaned || cleaned === "+" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  const raw = asTrimmedString(value)?.toLowerCase();
  if (raw === "true" || raw === "yes") return true;
  if (raw === "false" || raw === "no") return false;
  return null;
}

function parseInstant(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  const raw = asTrimmedString(value);
  if (raw == null || raw.length === 0) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

export function normalizeForCompare(
  value: unknown,
  dataType: string | null | undefined,
): NormalizedValue | null {
  const type = (dataType ?? "string").trim().toLowerCase();
  if (type === "number" || type === "currency") {
    const number = parseNumber(value);
    return number == null ? null : { kind: "number", value: number };
  }
  if (type === "boolean") {
    const bool = parseBoolean(value);
    return bool == null ? null : { kind: "boolean", value: bool };
  }
  if (type === "email") {
    const email = asTrimmedString(value);
    return email == null ? null : { kind: "email", value: email.toLowerCase() };
  }
  if (type === "date" || type === "datetime") {
    const instant = parseInstant(value);
    return instant == null ? null : { kind: "instant", value: instant };
  }
  const text = asTrimmedString(value);
  return text == null ? null : { kind: "string", value: text };
}

export function displayEvidenceValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
