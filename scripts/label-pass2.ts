/**
 * Label pass 2: an independent re-derivation of good/bad labels.
 *
 * Deliberately does NOT import lib/verification or lib/receipts/verify. It reads
 * the raw JSON systems of record and the gold claims (what each rationale states)
 * and applies the label guide (labels/LABEL_GUIDE.md) as plain rules.
 * Disagreements with pass 1 are written out for a human to settle.
 *
 * This is a scripted second pass, not a second human labeller.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const R = process.cwd();
const j = (p: string) => JSON.parse(readFileSync(join(R, p), "utf8"));
const pos: Array<{ id: string; supplier_id: string; cost_center: string; amount_eur: number }> = j("data/erp_purchase_orders.json");
const sups: Array<{ id: string; iso_9001: { expires_on: string } | null }> = j("data/suppliers.json");
const buds: Array<{ cost_center: string; available_eur: number }> = j("data/budgets.json");
const ctrs: Array<{ id: string; supplier_id: string; unit_price_eur: number; valid_from: string; valid_until: string }> = j("data/contracts.json");
const decs: Array<{ id: string; receipt_no: number; timestamp: string; action: string }> = j("data/decisions.json");
const gold: Array<{ decision_id: string; claims: Array<{ type: string; params: Record<string, any> }> }> = j("labels/gold-claims.json");
const gt: Array<{ decision_id: string; label_pass1: string; defect_type: string | null }> = j("labels/ground-truth.json");

const reasonsFor = (d: (typeof decs)[number]): string[] => {
  const date = d.timestamp.slice(0, 10);
  const out: string[] = [];
  for (const c of gold.find((g) => g.decision_id === d.id)!.claims) {
    const p = c.params;
    const po = pos.find((x) => x.id === p.po_id);
    const sup = sups.find((x) => x.id === p.supplier_id);
    const ctr = ctrs.find((x) => x.id === p.contract_id);
    const bud = buds.find((x) => x.cost_center === p.cost_center);
    if (c.type === "po_exists" && !po) out.push("po_missing");
    if (c.type === "po_amount" && po && Math.round(po.amount_eur * 100) !== Math.round(p.amount_eur * 100)) out.push("amount_mismatch");
    if (c.type === "po_supplier" && po && po.supplier_id !== p.supplier_id) out.push("supplier_mismatch");
    if (c.type === "supplier_iso_certified") {
      const valid = Boolean(sup?.iso_9001 && sup.iso_9001.expires_on >= date);
      if (p.claimed_valid && !sup?.iso_9001) out.push("certificate_not_on_file");
      else if (p.claimed_valid !== valid) out.push("expired_certificate");
    }
    if (c.type === "contract_exists" && !ctr) out.push("nonexistent_contract");
    if (c.type === "contract_valid" && ctr && !(ctr.valid_from <= date && date <= ctr.valid_until)) out.push("expired_contract");
    if (c.type === "contract_unit_price" && ctr && Math.abs(ctr.unit_price_eur - p.unit_price_eur) > 0.001) out.push("unit_price_mismatch");
    if (c.type === "budget_available" && bud && p.claimed_available !== bud.available_eur >= p.amount_eur) out.push("budget_exceeded");
  }
  // Single-approval limit (label guide §3): an agent approval above €10,000 (ERP amount).
  if (d.action === "approve_po") {
    const own = pos.find((x) => x.id === `PO-${4500 + d.receipt_no}`);
    if (own && own.amount_eur > 10000) out.push("over_approval_limit");
  }
  // Split orders (label guide §5): same supplier + cost center, earlier approval within 72h,
  // each ≤ €10,000, combined > €10,000. Only the completing order is bad.
  if (d.action === "approve_po") {
    const po = pos.find((x) => x.id === `PO-${4500 + d.receipt_no}`)!;
    const t = Date.parse(d.timestamp);
    const sib = decs.filter((o) => {
      if (o.id === d.id || o.action !== "approve_po") return false;
      const dt = t - Date.parse(o.timestamp);
      const op = pos.find((x) => x.id === `PO-${4500 + o.receipt_no}`)!;
      return dt > 0 && dt <= 72 * 3600_000 && op.supplier_id === po.supplier_id && op.cost_center === po.cost_center && op.amount_eur <= 10000;
    });
    const sum = po.amount_eur + sib.reduce((a, o) => a + pos.find((x) => x.id === `PO-${4500 + o.receipt_no}`)!.amount_eur, 0);
    if (sib.length && po.amount_eur <= 10000 && sum > 10000) out.push("split_order");
  }
  return out;
};

const rows = decs.map((d) => {
  const reasons = reasonsFor(d);
  const p1 = gt.find((g) => g.decision_id === d.id)!;
  return { decision_id: d.id, receipt_no: d.receipt_no, label_pass1: p1.label_pass1, label_pass2: reasons.length ? "bad" : "good", pass1_defect: p1.defect_type, pass2_reasons: reasons };
});
const disagreements = rows.filter((r) => r.label_pass1 !== r.label_pass2);
writeFileSync(join(R, "labels", "label-pass2.json"), JSON.stringify({ generated_at: new Date().toISOString(), agreement: (rows.length - disagreements.length) / rows.length, disagreements, rows }, null, 2));
console.log(`Pass 2 agrees with pass 1 on ${rows.length - disagreements.length}/${rows.length} decisions.`);
for (const d of disagreements) console.log(`  #${d.receipt_no}: pass1=${d.label_pass1} (${d.pass1_defect}) pass2=${d.label_pass2} (${d.pass2_reasons.join(", ")})`);
