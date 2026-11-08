/**
 * Deterministic dot-path resolver for evidence objects.
 * Not JSONPath. No expressions. Case-insensitive key fallback per segment.
 */

export type PathResolveResult =
  | { found: true; value: unknown }
  | { found: false };

function readKey(record: Record<string, unknown>, segment: string): PathResolveResult {
  if (Object.prototype.hasOwnProperty.call(record, segment)) {
    return { found: true, value: record[segment] };
  }
  const matches = Object.keys(record).filter(
    (key) => key.toLowerCase() === segment.toLowerCase(),
  );
  if (matches.length === 1) {
    return { found: true, value: record[matches[0]!] };
  }
  return { found: false };
}

export function resolveDotPath(source: unknown, path: string): PathResolveResult {
  const trimmed = path.trim();
  if (!trimmed) return { found: false };
  const segments = trimmed.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return { found: false };

  let current: unknown = source;
  for (const segment of segments) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return { found: false };
    }
    const next = readKey(current as Record<string, unknown>, segment);
    if (!next.found) return { found: false };
    current = next.value;
  }
  if (current === undefined) return { found: false };
  return { found: true, value: current };
}

export function isEmptyEvidenceValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}
