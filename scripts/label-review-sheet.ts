/**
 * Builds labels/LABEL_REVIEW.md: the manual label pass (pass 3) for Tanatswa.
 * One block per decision to check (15 bad + 5 edge cases): the agent's text, the raw
 * records, the pass-1 label and pass-2 result. The reviewer ticks Agree or Disagree.
 * It reads raw data only; it does not run the verifier, so it doesn't lead the reviewer.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const R = process.cwd();
const j = (p: string) => JSON.parse(readFileSync(join(R, p), "utf8"));
const decisions: any[] = j("data/decisions.json");
const truth: any[] = j("labels/ground-truth.json");
const pass2: any = j("labels/label-pass2.json");
const pos: any[] = j("data/erp_purchase_orders.json");
const sups: any[] = j("data/suppliers.json");
const buds: any[] = j("data/budgets.json");
const ctrs: any[] = j("data/contracts.json");

const EDGE = [9, 12, 16, 18, 33];
const pick = decisions.filter((d) => truth.find((t) => t.decision_id === d.id).label_pass1 === "bad" || EDGE.includes(d.receipt_no));
const eur = (n: number) => `€${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const out: string[] = [
  "# Label pass 3: manual review",
  "",
  `${pick.length} decisions: the ${pick.filter((d) => truth.find((t) => t.decision_id === d.id).label_pass1 === "bad").length} labelled bad and ${pick.filter((d) => truth.find((t) => t.decision_id === d.id).label_pass1 === "good").length} edge cases labelled good. For each one, read the agent's text and the records, then tick **one** box. Rules: [LABEL_GUIDE.md](LABEL_GUIDE.md). About 2 minutes each. Synthetic data only.`,
  "",
  "When done, tell Claude; disagreements get fixed in the generator and the numbers re-run.",
  "",
  "> **Status 8 Nov 2026:** skipped to meet the Loom deadline. Not yet reviewed by a human.",
  "",
];

for (const d of pick) {
  const t = truth.find((x) => x.decision_id === d.id);
  const p2 = pass2.rows.find((x: any) => x.decision_id === d.id);
  const po = pos.find((x) => x.id === `PO-${4500 + d.receipt_no}`);
  const sup = sups.find((x) => x.id === po?.supplier_id);
  const bud = buds.find((x) => x.cost_center === po?.cost_center);
  const cited = [...d.rationale.matchAll(/CTR-\d{4}-\d{3}/g)].map((m: RegExpMatchArray) => m[0]);
  out.push(`---`, "", `## #${d.receipt_no} · ${d.action} · ${d.timestamp.slice(0, 10)}${EDGE.includes(d.receipt_no) ? " · edge case" : ""}`, "");
  out.push(`**Agent wrote:** ${d.rationale}`, "");
  out.push(`**Records on ${d.timestamp.slice(0, 10)}:**`);
  if (po) out.push(`- ERP ${po.id}: ${eur(po.amount_eur)}, supplier ${po.supplier_id}, cost center ${po.cost_center}`);
  if (sup) out.push(`- Supplier ${sup.id} (${sup.name}): ISO 9001 ${sup.iso_9001 ? `${sup.iso_9001.cert_id}, valid until ${sup.iso_9001.expires_on}` : "**no certificate on file**"}`);
  if (bud) out.push(`- Budget ${bud.id}: ${eur(bud.available_eur)} available`);
  for (const id of cited) {
    const c = ctrs.find((x) => x.id === id);
    out.push(c ? `- Contract ${c.id}: supplier ${c.supplier_id}, ${eur(c.unit_price_eur)}/unit, valid ${c.valid_from} → ${c.valid_until}` : `- Contract ${id}: **does not exist**`);
  }
  if (d.receipt_no === 19 || d.receipt_no === 18) {
    const other = pos.find((x) => x.id === (d.receipt_no === 19 ? "PO-4518" : "PO-4519"));
    out.push(`- Related order ${other.id}: ${eur(other.amount_eur)}, same supplier and cost center (approval limit €10,000 per order, 72 h window)`);
  }
  out.push("", `**Label:** ${t.label_pass1.toUpperCase()}${t.defect_type ? ` (${t.defect_type.replace(/_/g, " ")})` : ""}. ${t.note}`);
  out.push(`**Pass 2 (script):** ${p2.label_pass2}${p2.pass2_reasons.length ? ` (${p2.pass2_reasons.join(", ")})` : ""}`, "");
  out.push("- [ ] Agree", "- [ ] Disagree. Why: ", "");
}
writeFileSync(join(R, "labels", "LABEL_REVIEW.md"), out.join("\n"));
console.log(`Wrote labels/LABEL_REVIEW.md (${pick.length} decisions)`);
