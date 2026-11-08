import { isEmptyEvidenceValue } from "@/lib/verification/path-resolve";
import { normalizeForCompare, type NormalizedValue } from "@/lib/verification/normalize";

export type RuleEvalResult = "passed" | "failed" | "insufficient_evidence";

export type CompareOutcome = {
  result: RuleEvalResult;
  message: string | null;
};

function valuesEqual(left: NormalizedValue, right: NormalizedValue): boolean | null {
  if (left.kind !== right.kind) return null;
  return left.value === right.value;
}

function numericOrder(left: NormalizedValue, right: NormalizedValue): number | null {
  if (left.kind === "number" && right.kind === "number") return left.value - right.value;
  if (left.kind === "instant" && right.kind === "instant") return left.value - right.value;
  return null;
}

export function evaluateOperator(input: {
  operator: string;
  dataType: string | null;
  expectedValue: unknown;
  expectedPresent: boolean;
  observedValue: unknown;
  observedPresent: boolean;
}): CompareOutcome {
  const operator = input.operator.trim().toLowerCase();

  if (operator === "exists") {
    if (!input.observedPresent) {
      return { result: "insufficient_evidence", message: "Required observed evidence was not found." };
    }
    return isEmptyEvidenceValue(input.observedValue)
      ? { result: "failed", message: "Observed value is empty." }
      : { result: "passed", message: null };
  }

  if (operator === "not_exists") {
    if (!input.observedPresent || isEmptyEvidenceValue(input.observedValue)) {
      return { result: "passed", message: null };
    }
    return { result: "failed", message: "Observed value exists." };
  }

  if (!input.observedPresent) {
    return { result: "insufficient_evidence", message: "Required observed evidence was not found." };
  }
  if (operator !== "exists" && operator !== "not_exists" && !input.expectedPresent) {
    return { result: "insufficient_evidence", message: "Required expected evidence was not found." };
  }

  const observed = normalizeForCompare(input.observedValue, input.dataType);
  const expected = normalizeForCompare(input.expectedValue, input.dataType);
  if (observed == null || expected == null) {
    return {
      result: "insufficient_evidence",
      message: "Values could not be compared using the configured data type.",
    };
  }

  if (operator === "eq") {
    const equal = valuesEqual(expected, observed);
    if (equal == null) {
      return {
        result: "insufficient_evidence",
        message: "Expected and observed values are not comparable.",
      };
    }
    return equal
      ? { result: "passed", message: null }
      : { result: "failed", message: "Observed value does not equal expected value." };
  }

  if (operator === "neq") {
    const equal = valuesEqual(expected, observed);
    if (equal == null) {
      return {
        result: "insufficient_evidence",
        message: "Expected and observed values are not comparable.",
      };
    }
    return equal
      ? { result: "failed", message: "Observed value equals expected value." }
      : { result: "passed", message: null };
  }

  const delta = numericOrder(expected, observed);
  if (delta == null) {
    return {
      result: "insufficient_evidence",
      message: "Numeric or date comparison is not possible for these values.",
    };
  }

  switch (operator) {
    case "gt":
      return delta < 0
        ? { result: "passed", message: null }
        : { result: "failed", message: "Observed value is not greater than expected value." };
    case "gte":
      return delta <= 0
        ? { result: "passed", message: null }
        : { result: "failed", message: "Observed value is less than expected value." };
    case "lt":
      return delta > 0
        ? { result: "passed", message: null }
        : { result: "failed", message: "Observed value is not less than expected value." };
    case "lte":
      return delta >= 0
        ? { result: "passed", message: null }
        : { result: "failed", message: "Observed value is greater than expected value." };
    default:
      return { result: "insufficient_evidence", message: "This comparison is not supported." };
  }
}

export function aggregateRunStatus(input: {
  required: Array<{ result: RuleEvalResult }>;
}): "verified" | "deviation" | "insufficient_evidence" {
  const failed = input.required.some((rule) => rule.result === "failed");
  if (failed) return "deviation";
  const missing = input.required.some((rule) => rule.result === "insufficient_evidence");
  if (missing) return "insufficient_evidence";
  return "verified";
}
