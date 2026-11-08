/**
 * Decision -> receipt. Claims come from the tool call (code) and, in AI-on mode,
 * from the model's extraction of the free text. Every verdict is set by code.
 */
import type { Claim, ClaimResult } from "@/lib/receipts/claims";
import type { Decision, SystemsOfRecord } from "@/lib/receipts/data";
import { approvalLimitCheck, splitOrderCheck, poIdForDecision } from "@/lib/receipts/policy";
import { claimsFromToolCall } from "@/lib/receipts/structured";
import { verifyClaim } from "@/lib/receipts/verify";

export type ReceiptStatus = "flagged" | "verified" | "unverifiable";

export type Receipt = {
  decision: Decision;
  status: ReceiptStatus;
  claims: ClaimResult[];
  counts: { verified: number; contradicted: number; unsupported: number; out_of_scope: number };
  eur_at_risk: number;
  risk_basis: string;
  top_issue: string | null;
};

function claimKey(c: Claim): string {
  return `${c.type}|${JSON.stringify(c.params, Object.keys(c.params).sort())}`;
}

/** Drop model claims that say exactly what the tool call already says. */
export function mergeClaims(toolClaims: Claim[], modelClaims: Claim[]): Claim[] {
  const seen = new Set(toolClaims.map(claimKey));
  return [...toolClaims, ...modelClaims.filter((c) => !seen.has(claimKey(c)))];
}

function amountAtStake(decision: Decision, claims: ClaimResult[], db: SystemsOfRecord): { eur: number; basis: string } {
  if (decision.action === "reject_po") return { eur: 0, basis: "rejection: no money committed" };
  const poIds = claims.flatMap((c) => ("po_id" in c.params ? [String(c.params.po_id)] : []));
  const poId = poIdForDecision(decision, poIds);
  const po = poId ? db.purchaseOrders.get(poId) : undefined;
  if (po) return { eur: po.amount_eur, basis: `ERP amount of ${po.id}` };
  const claimed = claims.find((c) => c.type === "po_amount");
  if (claimed && "amount_eur" in claimed.params) return { eur: Number(claimed.params.amount_eur), basis: "amount stated by the agent (PO not in ERP)" };
  return { eur: 0, basis: "no amount known" };
}

export function buildReceipts(input: {
  decisions: Decision[];
  db: SystemsOfRecord;
  modelClaims?: Map<string, Claim[]>; // decisionId -> claims (AI-on)
}): Receipt[] {
  const { decisions, db } = input;
  const claimSets = decisions.map((decision) => {
    const tool = claimsFromToolCall(decision);
    const model = input.modelClaims?.get(decision.id) ?? [];
    return mergeClaims(tool, model);
  });
  const poIndex = decisions.map((decision, i) => ({
    decision,
    poId: poIdForDecision(decision, claimSets[i]!.flatMap((c) => ("po_id" in c.params ? [String(c.params.po_id)] : []))),
  }));

  return decisions.map((decision, i) => {
    const results: ClaimResult[] = claimSets[i]!.map((claim) => verifyClaim(claim, decision, db));
    const policy = splitOrderCheck({ decision, poId: poIndex[i]!.poId, all: poIndex, db });
    if (policy) results.push(policy);
    const limit = approvalLimitCheck({ decision, poId: poIndex[i]!.poId, db });
    if (limit) results.push(limit);

    const counts = { verified: 0, contradicted: 0, unsupported: 0, out_of_scope: 0 };
    for (const r of results) counts[r.verdict] += 1;
    const checkable = counts.verified + counts.contradicted + counts.unsupported;
    // A receipt with only the implicit policy check has no claim from the agent itself.
    const agentClaims = results.filter((r) => r.source !== "policy" && r.verdict !== "out_of_scope").length;
    const status: ReceiptStatus =
      counts.contradicted + counts.unsupported > 0 ? "flagged" : checkable === 0 || agentClaims === 0 ? "unverifiable" : "verified";
    const stake = amountAtStake(decision, results, db);
    const issue = results.find((r) => r.verdict === "contradicted") ?? results.find((r) => r.verdict === "unsupported");
    return {
      decision,
      status,
      claims: results,
      counts,
      eur_at_risk: status === "flagged" ? stake.eur : 0,
      risk_basis: stake.basis,
      top_issue: issue?.message ?? null,
    };
  });
}

/** Review queue: flagged by € at risk, then unverifiable by amount, then verified. */
export function reviewQueue(receipts: Receipt[], db: SystemsOfRecord): Receipt[] {
  const rank = (r: Receipt) => (r.status === "flagged" ? 0 : r.status === "unverifiable" ? 1 : 2);
  const exposure = (r: Receipt) => {
    if (r.status === "flagged") return r.eur_at_risk;
    const po = r.decision.tool_call ? db.purchaseOrders.get(r.decision.tool_call.po_id) : undefined;
    return po?.amount_eur ?? 0;
  };
  return [...receipts].sort((a, b) => rank(a) - rank(b) || exposure(b) - exposure(a) || a.decision.receipt_no - b.decision.receipt_no);
}
