/**
 * Deterministic Evidence Resolver.
 *
 * Event selection (generic — no domain-specific node or system names):
 * 1. If the binding names a system, use only events whose `tool` matches that
 *    system name (case-insensitive, or alphanumeric inclusion either way,
 *    e.g. "HubSpot" vs "n8n-nodes-base.hubspot"). A system-scoped binding does
 *    not steal values from a different system's events. If nothing matches,
 *    that binding is missing and the next priority binding may be tried.
 * 2. If no system is configured, search every event that contains the path.
 * 3. Keep only events where the path resolves in before_state, after_state,
 *    or top-level metadata (tool, action, resource_id, status, event_type).
 * 4. Location order: `input` tries before_state → after_state → top-level.
 *    Other stages try after_state → before_state → top-level.
 * 5. Stage pick: `input` = earliest matching event by sequence/occurred_at.
 *    `action` = last matching event that has an `action`, else last match.
 *    `output` / `final_state` / `custom` / unset = last matching event.
 *
 * Multiple observations for one field: try bindings by `priority` ascending
 * (then createdAt). First resolved value wins; missing preferred evidence
 * falls back to the next binding. Never pick arbitrarily.
 */
import { resolveDotPath } from "@/lib/verification/path-resolve";

export type RuntimeEvidenceEvent = {
  id: string;
  eventId: string;
  eventType: string;
  sequence: number;
  occurredAt: string;
  tool: string | null;
  action: string | null;
  resourceId: string | null;
  status: string;
  beforeState: unknown;
  afterState: unknown;
};

export type EvidenceBinding = {
  id: string | null;
  targetFieldId: string;
  canonicalName: string;
  sourceType: string;
  systemId: string | null;
  systemName: string | null;
  evidencePath: string;
  stage: string | null;
  priority: number;
  createdAt: string;
};

export type EvidenceResolveResult = {
  status: "resolved" | "missing";
  targetFieldId: string;
  canonicalName: string;
  observedValue: unknown;
  eventId: string | null;
  eventRowId: string | null;
  bindingId: string | null;
  systemId: string | null;
  systemName: string | null;
  sourceType: string;
  evidencePath: string;
  stage: string | null;
};

function alnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function toolMatchesSystem(tool: string | null | undefined, systemName: string | null | undefined): boolean {
  if (!tool?.trim() || !systemName?.trim()) return false;
  if (tool.trim().toLowerCase() === systemName.trim().toLowerCase()) return true;
  const toolKey = alnum(tool);
  const systemKey = alnum(systemName);
  if (!toolKey || !systemKey) return false;
  return toolKey.includes(systemKey) || systemKey.includes(toolKey);
}

function topLevelRecord(event: RuntimeEvidenceEvent): Record<string, unknown> {
  return {
    tool: event.tool,
    action: event.action,
    resource_id: event.resourceId,
    status: event.status,
    event_type: event.eventType,
  };
}

function locationOrder(stage: string | null): Array<"after_state" | "before_state" | "top"> {
  if (stage === "input") return ["before_state", "after_state", "top"];
  return ["after_state", "before_state", "top"];
}

function sourceForLocation(
  event: RuntimeEvidenceEvent,
  location: "after_state" | "before_state" | "top",
): unknown {
  if (location === "after_state") return event.afterState;
  if (location === "before_state") return event.beforeState;
  return topLevelRecord(event);
}

export function extractFromEvent(
  event: RuntimeEvidenceEvent,
  evidencePath: string,
  stage: string | null,
  fallbackPath?: string | null,
): { found: boolean; value: unknown } {
  const paths = [evidencePath, fallbackPath].filter(
    (path): path is string => typeof path === "string" && path.trim().length > 0,
  );
  const uniquePaths = [...new Set(paths)];
  for (const location of locationOrder(stage)) {
    const source = sourceForLocation(event, location);
    for (const path of uniquePaths) {
      const resolved = resolveDotPath(source, path);
      if (resolved.found) return { found: true, value: resolved.value };
    }
  }
  return { found: false, value: undefined };
}

function eventHasPath(
  event: RuntimeEvidenceEvent,
  evidencePath: string,
  stage: string | null,
  fallbackPath?: string | null,
): boolean {
  return extractFromEvent(event, evidencePath, stage, fallbackPath).found;
}

function pickEvent(
  events: RuntimeEvidenceEvent[],
  stage: string | null,
): RuntimeEvidenceEvent | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.occurredAt.localeCompare(right.occurredAt);
  });
  if (stage === "input") return sorted[0] ?? null;
  if (stage === "action") {
    const withAction = sorted.filter((event) => Boolean(event.action?.trim()));
    const pool = withAction.length > 0 ? withAction : sorted;
    return pool[pool.length - 1] ?? null;
  }
  return sorted[sorted.length - 1] ?? null;
}

export function sortBindings(bindings: EvidenceBinding[]): EvidenceBinding[] {
  return [...bindings].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    const created = left.createdAt.localeCompare(right.createdAt);
    if (created !== 0) return created;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

export function resolveEvidence(
  binding: EvidenceBinding,
  events: RuntimeEvidenceEvent[],
  fallbackPath?: string | null,
): EvidenceResolveResult {
  const missing = (partial?: Partial<EvidenceResolveResult>): EvidenceResolveResult => ({
    status: "missing",
    targetFieldId: binding.targetFieldId,
    canonicalName: binding.canonicalName,
    observedValue: undefined,
    eventId: null,
    eventRowId: null,
    bindingId: binding.id,
    systemId: binding.systemId,
    systemName: binding.systemName,
    sourceType: binding.sourceType,
    evidencePath: binding.evidencePath,
    stage: binding.stage,
    ...partial,
  });

  if (!binding.evidencePath.trim()) return missing();

  let pool = events;
  if (binding.systemName?.trim()) {
    pool = events.filter((event) => toolMatchesSystem(event.tool, binding.systemName));
  }

  const candidates = pool.filter((event) =>
    eventHasPath(event, binding.evidencePath, binding.stage, fallbackPath),
  );
  const selected = pickEvent(candidates, binding.stage);
  if (!selected) return missing();

  const extracted = extractFromEvent(selected, binding.evidencePath, binding.stage, fallbackPath);
  if (!extracted.found) return missing();

  return {
    status: "resolved",
    targetFieldId: binding.targetFieldId,
    canonicalName: binding.canonicalName,
    observedValue: extracted.value,
    eventId: selected.eventId,
    eventRowId: selected.id,
    bindingId: binding.id,
    systemId: binding.systemId,
    systemName: binding.systemName,
    sourceType: binding.sourceType,
    evidencePath: binding.evidencePath,
    stage: binding.stage,
  };
}

export function resolveFieldEvidence(
  bindings: EvidenceBinding[],
  events: RuntimeEvidenceEvent[],
  fallbackPath?: string | null,
): EvidenceResolveResult {
  const ordered = sortBindings(bindings);
  let lastMissing: EvidenceResolveResult | null = null;
  for (const binding of ordered) {
    const result = resolveEvidence(binding, events, fallbackPath);
    if (result.status === "resolved") return result;
    lastMissing = result;
  }
  return (
    lastMissing ?? {
      status: "missing",
      targetFieldId: bindings[0]?.targetFieldId ?? "",
      canonicalName: bindings[0]?.canonicalName ?? "",
      observedValue: undefined,
      eventId: null,
      eventRowId: null,
      bindingId: null,
      systemId: null,
      systemName: null,
      sourceType: bindings[0]?.sourceType ?? "workflow_event_field",
      evidencePath: bindings[0]?.evidencePath ?? "",
      stage: bindings[0]?.stage ?? null,
    }
  );
}
