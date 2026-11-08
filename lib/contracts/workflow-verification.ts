/**
 * Verification v1 contracts.
 *
 * Run outcomes: verified | deviation | insufficient_evidence
 * Rule outcomes: passed | failed | insufficient_evidence
 *
 * Insufficient evidence is a first-class assurance result, not a server error.
 */

export const RUN_VERIFICATION_STATUSES = [
  "verified",
  "deviation",
  "insufficient_evidence",
] as const;

export type RunVerificationStatus = (typeof RUN_VERIFICATION_STATUSES)[number];

export const RULE_VERIFICATION_RESULTS = [
  "passed",
  "failed",
  "insufficient_evidence",
] as const;

export type RuleVerificationResult = (typeof RULE_VERIFICATION_RESULTS)[number];

export type WorkflowRuleVerificationSummary = {
  id: string;
  expectedRuleId: string | null;
  targetFieldId: string | null;
  targetCanonicalName: string;
  operator: string;
  result: RuleVerificationResult;
  isRequired: boolean;
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

export type WorkflowRunVerificationSummary = {
  id: string;
  workflowRunId: string;
  monitoredWorkflowId: string | null;
  status: RunVerificationStatus;
  requiredRuleCount: number;
  passedCount: number;
  failedCount: number;
  insufficientCount: number;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
  rules: WorkflowRuleVerificationSummary[];
};

export function runVerificationStatusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "deviation":
      return "DEVIATION";
    case "insufficient_evidence":
      return "INSUFFICIENT EVIDENCE";
    default:
      return status;
  }
}

export function ruleVerificationResultLabel(result: string): string {
  switch (result) {
    case "passed":
      return "PASSED";
    case "failed":
      return "FAILED";
    case "insufficient_evidence":
      return "INSUFFICIENT EVIDENCE";
    default:
      return result;
  }
}
