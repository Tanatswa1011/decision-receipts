/**
 * AI-off claim source: turn the agent's structured tool-call payload into claims
 * with plain code. No model involved. Free-text-only log entries yield no claims here.
 */
import type { Claim } from "@/lib/receipts/claims";
import type { Decision } from "@/lib/receipts/data";

export function claimsFromToolCall(decision: Decision): Claim[] {
  const t = decision.tool_call;
  if (!t) return [];
  const claims: Claim[] = [];
  let i = 0;
  const add = (c: Omit<Claim, "id" | "source">) => {
    i += 1;
    claims.push({ ...c, id: `${decision.id}:t${i}`, source: "tool_call" } as Claim);
  };
  const q = (field: string, value: unknown) => `tool_call.${field} = ${JSON.stringify(value)}`;

  add({ type: "po_exists", quote: q("po_id", t.po_id), params: { po_id: t.po_id } });
  add({ type: "po_amount", quote: q("amount_eur", t.amount_eur), params: { po_id: t.po_id, amount_eur: t.amount_eur } });
  add({ type: "po_supplier", quote: q("supplier_id", t.supplier_id), params: { po_id: t.po_id, supplier_id: t.supplier_id } });
  if (t.iso_certified !== null) {
    add({ type: "supplier_iso_certified", quote: q("iso_certified", t.iso_certified), params: { supplier_id: t.supplier_id, claimed_valid: t.iso_certified } });
  }
  if (t.contract_id) {
    add({ type: "contract_exists", quote: q("contract_id", t.contract_id), params: { contract_id: t.contract_id } });
    add({ type: "contract_valid", quote: q("contract_id", t.contract_id), params: { contract_id: t.contract_id } });
    add({ type: "contract_supplier", quote: q("contract_id", t.contract_id), params: { contract_id: t.contract_id, supplier_id: t.supplier_id } });
  }
  if (t.budget_available !== null) {
    add({
      type: "budget_available",
      quote: q("budget_available", t.budget_available),
      params: { cost_center: t.cost_center, amount_eur: t.amount_eur, claimed_available: t.budget_available },
    });
  }
  return claims;
}
