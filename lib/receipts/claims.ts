/**
 * Claim contract. The model's only job is to produce objects of this shape
 * from a decision's free-text rationale. Anything that fails this schema is
 * rejected and counted; it never reaches the verifier.
 */
import { z } from "zod";

const id = z.string().trim().min(1).max(40);
const eurAmount = z.number().finite().nonnegative();
const quote = z.string().trim().min(3).max(400);

export const CLAIM_TYPES = [
  "po_exists",
  "po_amount",
  "po_supplier",
  "supplier_iso_certified",
  "contract_exists",
  "contract_valid",
  "contract_supplier",
  "contract_unit_price",
  "budget_available",
  "out_of_scope",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const ExtractedClaimSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("po_exists"), quote, params: z.object({ po_id: id }).strict() }).strict(),
  z.object({ type: z.literal("po_amount"), quote, params: z.object({ po_id: id, amount_eur: eurAmount }).strict() }).strict(),
  z.object({ type: z.literal("po_supplier"), quote, params: z.object({ po_id: id, supplier_id: id }).strict() }).strict(),
  z.object({ type: z.literal("supplier_iso_certified"), quote, params: z.object({ supplier_id: id, claimed_valid: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("contract_exists"), quote, params: z.object({ contract_id: id }).strict() }).strict(),
  z.object({ type: z.literal("contract_valid"), quote, params: z.object({ contract_id: id }).strict() }).strict(),
  z.object({ type: z.literal("contract_supplier"), quote, params: z.object({ contract_id: id, supplier_id: id }).strict() }).strict(),
  z.object({ type: z.literal("contract_unit_price"), quote, params: z.object({ contract_id: id, unit_price_eur: eurAmount }).strict() }).strict(),
  z.object({ type: z.literal("budget_available"), quote, params: z.object({ cost_center: id, amount_eur: eurAmount, claimed_available: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("out_of_scope"), quote, params: z.object({}).strict() }).strict(),
]);
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export const ExtractionOutputSchema = z.object({ claims: z.array(ExtractedClaimSchema).max(25) }).strict();

export type ClaimSource = "tool_call" | "llm" | "policy";

/** Claims added by code from policy (the model cannot emit this type). */
export type PolicyClaim = { type: "policy_no_split" | "policy_approval_limit"; quote: string; params: { po_id: string } };

export type Claim = (ExtractedClaim | PolicyClaim) & {
  id: string;
  source: ClaimSource;
};

export type Verdict = "verified" | "contradicted" | "unsupported" | "out_of_scope";

export type ClaimResult = Claim & {
  verdict: Verdict;
  /** Always "code". Kept explicit so the share of code vs model verdicts is countable. */
  checked_by: "code";
  system: string | null;
  evidence_ids: string[];
  expected: string | null;
  observed: string | null;
  reason:
    | "match"
    | "mismatch"
    | "record_not_found"
    | "field_missing"
    | "not_comparable"
    | "no_system_of_record"
    | "policy_violation";
  message: string | null;
};

export function claimLabel(type: ClaimType | "policy_no_split" | "policy_approval_limit"): string {
  switch (type) {
    case "po_exists": return "Purchase order exists";
    case "po_amount": return "PO amount";
    case "po_supplier": return "PO supplier";
    case "supplier_iso_certified": return "Supplier ISO 9001 status";
    case "contract_exists": return "Contract exists";
    case "contract_valid": return "Contract in force";
    case "contract_supplier": return "Contract supplier";
    case "contract_unit_price": return "Contract unit price";
    case "budget_available": return "Budget available";
    case "out_of_scope": return "Not checkable";
    case "policy_no_split": return "No split order (policy)";
    case "policy_approval_limit": return "Approval limit (policy)";
  }
}
