/**
 * Plain-language wording for receipts (UI only). Pure formatting of what the
 * verifier already decided; it never changes a verdict.
 */
import type { ClaimResult } from "@/lib/receipts/claims";

export function money(value: unknown): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return `€${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export type ClaimText = { title: string; claim: string; record: string };

export function describeClaim(c: ClaimResult, decisionDate: string): ClaimText {
  const p = c.params as Record<string, any>;
  const missing = c.reason === "record_not_found";
  const obs = c.observed;
  switch (c.type) {
    case "po_exists":
      return { title: "Purchase order", claim: `${p.po_id} exists`, record: missing ? `${p.po_id} is not in the ERP` : `Found in ERP` };
    case "po_amount":
      return { title: "Order amount", claim: `${p.po_id} is ${money(p.amount_eur)}`, record: missing ? `${p.po_id} is not in the ERP` : `ERP says ${money(obs)}` };
    case "po_supplier":
      return { title: "Order supplier", claim: `${p.po_id} is for ${p.supplier_id}`, record: missing ? `${p.po_id} is not in the ERP` : `ERP says ${obs}` };
    case "supplier_iso_certified":
      return {
        title: "ISO 9001 certificate",
        claim: p.claimed_valid ? `${p.supplier_id} holds a valid certificate on ${decisionDate}` : `${p.supplier_id}'s certificate has expired`,
        record: missing ? `${p.supplier_id} is not in the supplier database` : obs == null ? `No certificate on file` : `Certificate valid until ${obs}`,
      };
    case "contract_exists":
      return { title: "Contract", claim: `${p.contract_id} exists`, record: missing ? `No contract ${p.contract_id} in the repository` : `Found in contract repository` };
    case "contract_valid":
      return { title: "Contract in force", claim: `${p.contract_id} is in force on ${decisionDate}`, record: missing ? `No contract ${p.contract_id} in the repository` : c.verdict === "verified" ? `Valid until ${obs}` : `Contract dates: ${obs}` };
    case "contract_supplier":
      return { title: "Contract supplier", claim: `${p.contract_id} covers ${p.supplier_id}`, record: missing ? `No contract ${p.contract_id} in the repository` : `Contract is with ${obs}` };
    case "contract_unit_price":
      return { title: "Unit price", claim: `${money(p.unit_price_eur)} per unit under ${p.contract_id}`, record: missing ? `No contract ${p.contract_id} in the repository` : `Contract price ${money(obs)} per unit` };
    case "budget_available":
      return {
        title: "Budget",
        claim: p.claimed_available ? `${p.cost_center} has ${money(p.amount_eur)} available` : `${p.cost_center} lacks budget for ${money(p.amount_eur)}`,
        record: missing ? `No Q4 budget for ${p.cost_center}` : c.verdict === "contradicted" && p.claimed_available ? `only ${money(obs)} is available in Q4` : `${money(obs)} available in Q4`,
      };
    case "policy_no_split":
      return { title: "Split order (policy)", claim: `No split orders to stay under the €10,000 limit`, record: `${obs ?? ""}` };
    case "policy_approval_limit":
      return { title: "Approval limit (policy)", claim: `Agent approvals at most €10,000 without human sign-off`, record: c.verdict === "verified" ? `Order is ${obs}` : `Order is ${obs}: needs human sign-off` };
    case "out_of_scope":
      return { title: "Not checkable", claim: c.quote, record: "No system of record covers this" };
  }
}

const SOURCE: Record<string, string> = { tool_call: "tool call", llm: "AI-extracted", policy: "policy" };
export function sourceLabel(source: string): string {
  return SOURCE[source] ?? source;
}

/** One-line finding for a flagged receipt: "Title: agent said X, but Y." */
export function headline(c: ClaimResult, decisionDate: string): string {
  if (c.type === "policy_no_split" || c.type === "policy_approval_limit") return c.message ?? "Approval policy violated";
  if (c.type === "supplier_iso_certified" && c.verdict === "contradicted" && c.message) return c.message.replace(/\s*\(SupplierDB [^)]+\)\.?$/, ".");
  const t = describeClaim(c, decisionDate);
  const rec = /^[A-Z][a-z]/.test(t.record) ? t.record.charAt(0).toLowerCase() + t.record.slice(1) : t.record;
  return `${t.title}: agent said ${t.claim}, but ${rec}.`;
}

export function topFinding(claims: ClaimResult[], decisionDate: string): ClaimResult | null {
  return claims.find((c) => c.verdict === "contradicted") ?? claims.find((c) => c.verdict === "unsupported") ?? null;
}
