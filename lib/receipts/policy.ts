/**
 * Cross-decision check (code only): split orders under POL-APPROVAL-01.
 *
 * An approval is contradicted if earlier approvals to the same supplier and cost
 * center within the policy window, plus this one, add up to more than the
 * single-approval limit while each order is under it. Amounts and suppliers come
 * from the ERP record, never from the agent's text.
 */
import type { ClaimResult } from "@/lib/receipts/claims";
import type { Decision, SystemsOfRecord } from "@/lib/receipts/data";

export function poIdForDecision(decision: Decision, claimPoIds: string[]): string | null {
  return decision.tool_call?.po_id ?? claimPoIds[0] ?? null;
}

export function splitOrderCheck(input: {
  decision: Decision;
  poId: string | null;
  all: Array<{ decision: Decision; poId: string | null }>;
  db: SystemsOfRecord;
}): ClaimResult | null {
  const { decision, poId, db } = input;
  if (decision.action !== "approve_po" || !poId) return null;
  const po = db.purchaseOrders.get(poId);
  const policy = db.policies.get("POL-APPROVAL-01");
  if (!po || !policy) return null;

  const at = Date.parse(decision.timestamp);
  const windowMs = policy.window_hours * 3600_000;
  const siblings = input.all.filter(({ decision: other, poId: otherPo }) => {
    if (other.id === decision.id || other.action !== "approve_po" || !otherPo) return false;
    const t = Date.parse(other.timestamp);
    if (!(t < at && at - t <= windowMs)) return false;
    const otherRecord = db.purchaseOrders.get(otherPo);
    return Boolean(
      otherRecord &&
        otherRecord.supplier_id === po.supplier_id &&
        otherRecord.cost_center === po.cost_center &&
        otherRecord.amount_eur <= policy.limit_eur,
    );
  });

  const base = {
    id: `${decision.id}:p1`,
    type: "policy_no_split" as const,
    quote: `Implicit: approval stays within ${policy.id} (no split order)`,
    params: { po_id: poId },
    source: "policy" as const,
    checked_by: "code" as const,
    system: "PolicyRegister + ERP",
  };

  const combined = po.amount_eur + siblings.reduce((sum, s) => sum + db.purchaseOrders.get(s.poId!)!.amount_eur, 0);
  if (siblings.length > 0 && po.amount_eur <= policy.limit_eur && combined > policy.limit_eur) {
    return {
      ...base,
      verdict: "contradicted",
      evidence_ids: [policy.id, po.id, ...siblings.map((s) => s.poId!), ...siblings.map((s) => s.decision.id)],
      expected: `combined ≤ €${policy.limit_eur.toLocaleString("en-US")} within ${policy.window_hours}h`,
      observed: `€${combined.toLocaleString("en-US")} across ${siblings.length + 1} orders`,
      reason: "policy_violation",
      message: `Split order: ${[...siblings.map((s) => s.poId), po.id].join(" + ")} to ${po.supplier_id} / ${po.cost_center} total €${combined.toLocaleString("en-US")}, above the €${policy.limit_eur.toLocaleString("en-US")} single-approval limit.`,
    };
  }
  return {
    ...base,
    verdict: "verified",
    evidence_ids: [policy.id, po.id],
    expected: `combined ≤ €${policy.limit_eur.toLocaleString("en-US")} within ${policy.window_hours}h`,
    observed: siblings.length === 0 ? "no related orders in window" : `€${combined.toLocaleString("en-US")}`,
    reason: "match",
    message: null,
  };
}

/**
 * Single-approval limit under POL-APPROVAL-01 (code only): an agent may approve a PO
 * up to the limit without human sign-off. The comparison uses ACPT's compare.ts
 * (operator `lte`, currency) on the ERP amount, never the amount the agent stated.
 * Added 8 Nov 2026 after the manual label review found #12 (€18,500) unchecked.
 */
import { evaluateOperator } from "@/lib/verification/compare";

export function approvalLimitCheck(input: { decision: Decision; poId: string | null; db: SystemsOfRecord }): ClaimResult | null {
  const { decision, poId, db } = input;
  if (decision.action !== "approve_po" || !poId) return null;
  const po = db.purchaseOrders.get(poId);
  const policy = db.policies.get("POL-APPROVAL-01");
  if (!po || !policy) return null;
  const outcome = evaluateOperator({
    operator: "lte",
    dataType: "currency",
    expectedValue: policy.limit_eur,
    expectedPresent: true,
    observedValue: po.amount_eur,
    observedPresent: true,
  });
  const limit = `€${policy.limit_eur.toLocaleString("en-US")}`;
  const amount = `€${po.amount_eur.toLocaleString("en-US")}`;
  return {
    id: `${decision.id}:p2`,
    type: "policy_approval_limit",
    quote: `Implicit: an agent may approve at most ${limit} without human sign-off (${policy.id})`,
    params: { po_id: poId },
    source: "policy",
    checked_by: "code",
    system: "PolicyRegister + ERP",
    verdict: outcome.result === "passed" ? "verified" : outcome.result === "failed" ? "contradicted" : "unsupported",
    evidence_ids: [policy.id, po.id],
    expected: `≤ ${limit}`,
    observed: amount,
    reason: outcome.result === "passed" ? "match" : "policy_violation",
    message: outcome.result === "passed" ? null : `Approved ${amount} without human sign-off; the agent limit is ${limit} (${policy.id}).`,
  };
}
