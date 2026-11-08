/**
 * Deterministic rule evaluation: resolve expected + observed evidence, compare
 * with configured operators, aggregate run status.
 *
 * Expected mapped fields reuse the Evidence Resolver. Source-system mapping
 * (system + source_field_name) is preferred so a self-mapped canonical field
 * can still compare source evidence to a later observation. Observed bindings
 * for that source field are the fallback.
 *
 * Observed values use configured bindings in priority order, then implicit
 * field mapping if none exist.
 */
import { aggregateRunStatus, evaluateOperator, type RuleEvalResult } from "@/lib/verification/compare";
import {
  resolveFieldEvidence,
  type EvidenceBinding,
  type EvidenceResolveResult,
  type RuntimeEvidenceEvent,
} from "@/lib/verification/evidence-resolver";
import { displayEvidenceValue } from "@/lib/verification/normalize";

export type VerificationField = {
  id: string;
  canonicalName: string;
  sourceFieldName: string;
  dataType: string;
  systemId: string;
  systemName: string;
};

export type VerificationExpectedRule = {
  id: string;
  targetFieldId: string;
  expectedSourceType: string | null;
  expectedSourceFieldId: string | null;
  operator: string;
  staticValue: string | null;
  isRequired: boolean;
};

export type EvaluatedRuleResult = {
  expectedRuleId: string;
  targetFieldId: string;
  targetCanonicalName: string;
  operator: string;
  isRequired: boolean;
  result: RuleEvalResult;
  expectedValue: string | null;
  observedValue: string | null;
  expectedEvidenceEventId: string | null;
  observedEvidenceEventId: string | null;
  observedBindingId: string | null;
  observedSourceType: string | null;
  observedSystemName: string | null;
  evidencePath: string | null;
  eventStage: string | null;
  message: string | null;
};

export type RunVerificationEvaluation = {
  status: "verified" | "deviation" | "insufficient_evidence";
  requiredRuleCount: number;
  passedCount: number;
  failedCount: number;
  insufficientCount: number;
  rules: EvaluatedRuleResult[];
};

function implicitBinding(field: VerificationField, priority: number): EvidenceBinding {
  return {
    id: null,
    targetFieldId: field.id,
    canonicalName: field.canonicalName,
    sourceType: "system_field",
    systemId: field.systemId,
    systemName: field.systemName,
    evidencePath: field.sourceFieldName,
    stage: null,
    priority,
    createdAt: "",
  };
}

function observedBindingsForField(
  field: VerificationField,
  bindings: EvidenceBinding[],
): EvidenceBinding[] {
  const explicit = bindings.filter((binding) => binding.targetFieldId === field.id);
  if (explicit.length > 0) return explicit;
  return [implicitBinding(field, 10_000)];
}

function expectedBindingsForField(
  field: VerificationField,
  bindings: EvidenceBinding[],
): EvidenceBinding[] {
  const explicit = bindings.filter((binding) => binding.targetFieldId === field.id);
  return [implicitBinding(field, 0), ...explicit];
}

function resolveObservedField(
  field: VerificationField,
  bindings: EvidenceBinding[],
  events: RuntimeEvidenceEvent[],
): EvidenceResolveResult {
  return resolveFieldEvidence(
    observedBindingsForField(field, bindings),
    events,
    field.canonicalName,
  );
}

function resolveExpectedField(
  field: VerificationField,
  bindings: EvidenceBinding[],
  events: RuntimeEvidenceEvent[],
): EvidenceResolveResult {
  return resolveFieldEvidence(
    expectedBindingsForField(field, bindings),
    events,
    field.canonicalName,
  );
}

export function evaluateVerification(input: {
  rules: VerificationExpectedRule[];
  fields: VerificationField[];
  bindings: EvidenceBinding[];
  events: RuntimeEvidenceEvent[];
}): RunVerificationEvaluation {
  const fieldById = new Map(input.fields.map((field) => [field.id, field]));
  const rules: EvaluatedRuleResult[] = input.rules.map((rule) => {
    const target = fieldById.get(rule.targetFieldId);
    if (!target) {
      return {
        expectedRuleId: rule.id,
        targetFieldId: rule.targetFieldId,
        targetCanonicalName: rule.targetFieldId,
        operator: rule.operator,
        isRequired: rule.isRequired,
        result: "insufficient_evidence",
        expectedValue: null,
        observedValue: null,
        expectedEvidenceEventId: null,
        observedEvidenceEventId: null,
        observedBindingId: null,
        observedSourceType: null,
        observedSystemName: null,
        evidencePath: null,
        eventStage: null,
        message: "Target field mapping was not found.",
      };
    }

    const observed = resolveObservedField(target, input.bindings, input.events);
    let expectedPresent = false;
    let expectedValue: unknown;
    let expectedEventId: string | null = null;

    if (rule.operator === "exists" || rule.operator === "not_exists") {
      expectedPresent = true;
      expectedValue = null;
    } else if (rule.expectedSourceType === "static_value") {
      expectedPresent = rule.staticValue != null && rule.staticValue !== "";
      expectedValue = rule.staticValue;
    } else if (rule.expectedSourceType === "mapped_field" && rule.expectedSourceFieldId) {
      const sourceField = fieldById.get(rule.expectedSourceFieldId);
      if (!sourceField) {
        return {
          expectedRuleId: rule.id,
          targetFieldId: target.id,
          targetCanonicalName: target.canonicalName,
          operator: rule.operator,
          isRequired: rule.isRequired,
          result: "insufficient_evidence",
          expectedValue: null,
          observedValue: displayEvidenceValue(observed.observedValue),
          expectedEvidenceEventId: null,
          observedEvidenceEventId: observed.eventRowId,
          observedBindingId: observed.bindingId,
          observedSourceType: observed.sourceType,
          observedSystemName: observed.systemName,
          evidencePath: observed.evidencePath,
          eventStage: observed.stage,
          message: "Expected mapped field was not found.",
        };
      }
      const expectedResolved = resolveExpectedField(sourceField, input.bindings, input.events);
      expectedPresent = expectedResolved.status === "resolved";
      expectedValue = expectedResolved.observedValue;
      expectedEventId = expectedResolved.eventRowId;
    } else {
      expectedPresent = false;
      expectedValue = undefined;
    }

    const comparison = evaluateOperator({
      operator: rule.operator,
      dataType: target.dataType,
      expectedValue,
      expectedPresent,
      observedValue: observed.observedValue,
      observedPresent: observed.status === "resolved",
    });

    return {
      expectedRuleId: rule.id,
      targetFieldId: target.id,
      targetCanonicalName: target.canonicalName,
      operator: rule.operator,
      isRequired: rule.isRequired,
      result: comparison.result,
      expectedValue:
        rule.operator === "exists" || rule.operator === "not_exists"
          ? rule.operator === "exists"
            ? "exists"
            : "does not exist"
          : displayEvidenceValue(expectedValue),
      observedValue: displayEvidenceValue(observed.observedValue),
      expectedEvidenceEventId: expectedEventId,
      observedEvidenceEventId: observed.eventRowId,
      observedBindingId: observed.bindingId,
      observedSourceType: observed.sourceType,
      observedSystemName: observed.systemName,
      evidencePath: observed.evidencePath,
      eventStage: observed.stage,
      message: comparison.message,
    };
  });

  const required = rules.filter((rule) => rule.isRequired);
  const status = aggregateRunStatus({ required });
  return {
    status,
    requiredRuleCount: required.length,
    passedCount: required.filter((rule) => rule.result === "passed").length,
    failedCount: required.filter((rule) => rule.result === "failed").length,
    insufficientCount: required.filter((rule) => rule.result === "insufficient_evidence").length,
    rules,
  };
}
