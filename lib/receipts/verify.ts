/**
 * Deterministic claim verifier.
 *
 * Each claim type maps to (system of record, record lookup, field path, operator).
 * The comparison itself is done by ACPT's Verification v1 core
 * (lib/verification/evaluate.ts -> compare.ts -> normalize.ts), copied unchanged:
 *   passed                -> verified
 *   failed                -> contradicted  (the source says otherwise)
 *   insufficient_evidence -> unsupported   (no source / no record)
 *
 * No model is called anywhere in this file.
 */
import { evaluateVerification, type VerificationExpectedRule, type VerificationField } from "@/lib/verification/evaluate";
import type { RuntimeEvidenceEvent } from "@/lib/verification/evidence-resolver";
import type { Claim, ClaimResult } from "@/lib/receipts/claims";
import type { Decision, SystemsOfRecord } from "@/lib/receipts/data";

type Check = {
  path: string;
  dataType: string;
  operator: string;
  staticValue: string | null;
  label: string;
};

type Plan = {
  system: string;
  recordId: string;
  record: unknown | undefined;
  checks: Check[];
  evidenceIds: (recordFound: boolean) => string[];
};

function decisionDate(decision: Decision): string {
  return decision.timestamp.slice(0, 10);
}

function plan(claim: Claim, decision: Decision, db: SystemsOfRecord): Plan | null {
  const date = decisionDate(decision);
  const p = claim.params as Record<string, unknown>;
  switch (claim.type) {
    case "po_exists":
    case "po_amount":
    case "po_supplier": {
      const recordId = String(p.po_id);
      const checks: Check[] =
        claim.type === "po_exists"
          ? [{ path: "id", dataType: "string", operator: "exists", staticValue: null, label: "PO record" }]
          : claim.type === "po_amount"
            ? [{ path: "amount_eur", dataType: "currency", operator: "eq", staticValue: String(p.amount_eur), label: "amount_eur" }]
            : [{ path: "supplier_id", dataType: "string", operator: "eq", staticValue: String(p.supplier_id), label: "supplier_id" }];
      return { system: "ERP", recordId, record: db.purchaseOrders.get(recordId), checks, evidenceIds: (found) => (found ? [recordId] : []) };
    }
    case "supplier_iso_certified": {
      const recordId = String(p.supplier_id);
      const claimedValid = p.claimed_valid === true;
      // Certificate is valid through its expiry date inclusive (label guide §3).
      return {
        system: "SupplierDB",
        recordId,
        record: db.suppliers.get(recordId),
        checks: [{ path: "iso_9001.expires_on", dataType: "date", operator: claimedValid ? "gte" : "lt", staticValue: date, label: "iso_9001.expires_on" }],
        evidenceIds: (found) => (found ? [recordId] : []),
      };
    }
    case "contract_exists":
    case "contract_valid":
    case "contract_supplier":
    case "contract_unit_price": {
      const recordId = String(p.contract_id);
      const record = db.contracts.get(recordId);
      let checks: Check[];
      let passage: string;
      if (claim.type === "contract_exists") {
        checks = [{ path: "id", dataType: "string", operator: "exists", staticValue: null, label: "contract record" }];
        passage = `${recordId}#p1`;
      } else if (claim.type === "contract_valid") {
        checks = [
          { path: "valid_from", dataType: "date", operator: "lte", staticValue: date, label: "valid_from" },
          { path: "valid_until", dataType: "date", operator: "gte", staticValue: date, label: "valid_until" },
        ];
        passage = `${recordId}#p3`;
      } else if (claim.type === "contract_supplier") {
        checks = [{ path: "supplier_id", dataType: "string", operator: "eq", staticValue: String(p.supplier_id), label: "supplier_id" }];
        passage = `${recordId}#p1`;
      } else {
        checks = [{ path: "unit_price_eur", dataType: "currency", operator: "eq", staticValue: String(p.unit_price_eur), label: "unit_price_eur" }];
        passage = `${recordId}#p2`;
      }
      return { system: "ContractRepo", recordId, record, checks, evidenceIds: (found) => (found ? [passage] : []) };
    }
    case "budget_available": {
      const budget = db.budgets.get(String(p.cost_center));
      const claimedAvailable = p.claimed_available === true;
      return {
        system: "BudgetTable",
        recordId: budget?.id ?? `BUD-${String(p.cost_center)}`,
        record: budget,
        checks: [{ path: "available_eur", dataType: "currency", operator: claimedAvailable ? "gte" : "lt", staticValue: String(p.amount_eur), label: "available_eur" }],
        evidenceIds: (found) => (found && budget ? [budget.id] : []),
      };
    }
    case "out_of_scope":
    case "policy_no_split": // handled by lib/receipts/policy.ts
    case "policy_approval_limit":
      return null;
  }
}

/** Human-readable statement of what the claim asserts (expected side). */
function expectedText(check: Check): string {
  switch (check.operator) {
    case "exists": return "exists";
    case "eq": return `= ${check.staticValue}`;
    case "gte": return check.dataType === "date" ? `on or after ${check.staticValue}` : `≥ ${check.staticValue}`;
    case "lte": return check.dataType === "date" ? `on or before ${check.staticValue}` : `≤ ${check.staticValue}`;
    case "lt": return check.dataType === "date" ? `before ${check.staticValue}` : `< ${check.staticValue}`;
    default: return `${check.operator} ${check.staticValue}`;
  }
}

export function verifyClaim(claim: Claim, decision: Decision, db: SystemsOfRecord): ClaimResult {
  const p = plan(claim, decision, db);
  if (!p) {
    return {
      ...claim,
      verdict: "out_of_scope",
      checked_by: "code",
      system: null,
      evidence_ids: [],
      expected: null,
      observed: null,
      reason: "no_system_of_record",
      message: "No system of record covers this statement. Shown for the reviewer, not counted.",
    };
  }

  const recordFound = p.record !== undefined;
  // One synthetic "event" per looked-up record, so ACPT's evidence resolver can read it.
  const events: RuntimeEvidenceEvent[] = recordFound
    ? [{
        id: p.recordId,
        eventId: p.recordId,
        eventType: "system_of_record_snapshot",
        sequence: 1,
        occurredAt: decision.timestamp,
        tool: p.system,
        action: null,
        resourceId: p.recordId,
        status: "ok",
        beforeState: null,
        afterState: p.record,
      }]
    : [];
  const fields: VerificationField[] = p.checks.map((check, i) => ({
    id: `${claim.id}:f${i}`,
    canonicalName: check.path,
    sourceFieldName: check.path,
    dataType: check.dataType,
    systemId: p.system,
    systemName: p.system,
  }));
  const rules: VerificationExpectedRule[] = p.checks.map((check, i) => ({
    id: `${claim.id}:r${i}`,
    targetFieldId: `${claim.id}:f${i}`,
    expectedSourceType: "static_value",
    expectedSourceFieldId: null,
    operator: check.operator,
    staticValue: check.staticValue,
    isRequired: true,
  }));

  const evaluation = evaluateVerification({ rules, fields, bindings: [], events });

  const verdict =
    evaluation.status === "verified" ? "verified" : evaluation.status === "deviation" ? "contradicted" : "unsupported";
  const failing = evaluation.rules.find((r) => r.result === "failed") ?? evaluation.rules.find((r) => r.result === "insufficient_evidence");
  const shown = failing ?? evaluation.rules[evaluation.rules.length - 1]!;
  const shownCheck = p.checks[evaluation.rules.indexOf(shown)]!;

  let reason: ClaimResult["reason"] = "match";
  let message: string | null = null;
  if (!recordFound) {
    reason = "record_not_found";
    message = `${p.recordId} does not exist in ${p.system}. The decision cites a record with no source.`;
  } else if (verdict === "unsupported") {
    reason = shown.observedValue == null ? "field_missing" : "not_comparable";
    message = shown.observedValue == null
      ? claim.type === "supplier_iso_certified"
        ? `${p.recordId} has no ISO 9001 certificate on file in ${p.system}. The claim has no source.`
        : `${p.recordId} has no value for ${shownCheck.label} in ${p.system}.`
      : shown.message;
  } else if (verdict === "contradicted") {
    reason = "mismatch";
    message = `${p.system} ${p.recordId}: ${shownCheck.label} is ${shown.observedValue}, claim needs ${expectedText(shownCheck)}.`;
    if (claim.type === "supplier_iso_certified" && claim.params.claimed_valid) {
      const cert = db.suppliers.get(p.recordId)?.iso_9001;
      const days = Math.round((Date.parse(decisionDate(decision)) - Date.parse(String(shown.observedValue))) / 86_400_000);
      const ago = days >= 60 ? `${Math.round(days / 30.44)} months` : `${days} days`;
      message = `ISO 9001 certificate ${cert?.cert_id ?? ""} expired on ${shown.observedValue}, ${ago} before this decision (${p.system} ${p.recordId}).`;
    }
  }

  return {
    ...claim,
    verdict,
    checked_by: "code",
    system: p.system,
    evidence_ids: p.evidenceIds(recordFound),
    expected: expectedText(shownCheck),
    observed: shown.observedValue,
    reason,
    message,
  };
}
