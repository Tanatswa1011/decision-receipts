/**
 * Generates the synthetic dataset for Decision Receipts.
 *
 * Fictional company: Kesselfeld Antriebstechnik GmbH (invented). All suppliers,
 * people and IDs are invented. Any resemblance to a real company is coincidental.
 *
 * Output (deterministic, seeded):
 *   data/erp_purchase_orders.json   ERP purchase orders (system of record)
 *   data/suppliers.json             supplier master incl. ISO 9001 cert expiry
 *   data/budgets.json               cost-center budget table, Q4 2026
 *   data/contracts.json             frame contracts with passages
 *   data/policies.json              approval policy
 *   data/decisions.json             60 procurement-agent decision log entries
 *   labels/ground-truth.json        label pass 1 (planted at generation time)
 *   labels/gold-claims.json         the checkable claims written into each rationale
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// ---------- seeded PRNG (mulberry32) ----------
let seed = 20261107;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}
function amount(min: number, max: number): number {
  return Math.round((min + rand() * (max - min)) / 50) * 50;
}
function eur(n: number): string {
  return `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------- systems of record ----------
type Supplier = {
  id: string;
  name: string;
  country: string;
  approved_vendor: boolean;
  iso_9001: { cert_id: string; issued_on: string; expires_on: string } | null;
};

const suppliers: Supplier[] = [
  { id: "SUP-101", name: "Lindqvar Metallwerk", country: "SE", approved_vendor: true, iso_9001: { cert_id: "QC-41007", issued_on: "2024-03-01", expires_on: "2027-02-28" } },
  { id: "SUP-102", name: "Pemberly Seals Ltd", country: "GB", approved_vendor: true, iso_9001: { cert_id: "QC-41552", issued_on: "2025-01-15", expires_on: "2028-01-14" } },
  { id: "SUP-103", name: "Rautio Hydraulics Oy", country: "FI", approved_vendor: true, iso_9001: { cert_id: "QC-39810", issued_on: "2024-06-10", expires_on: "2027-06-09" } },
  // Demo supplier: certificate expired 7 Feb 2026, eight months before receipt #14.
  { id: "SUP-104", name: "Castellan Bearings S.p.A.", country: "IT", approved_vendor: true, iso_9001: { cert_id: "QC-55120", issued_on: "2023-02-08", expires_on: "2026-02-07" } },
  { id: "SUP-105", name: "Weidmoor Kunststoff GmbH", country: "DE", approved_vendor: true, iso_9001: { cert_id: "QC-40211", issued_on: "2025-04-01", expires_on: "2028-03-31" } },
  { id: "SUP-106", name: "Tervola Electronics", country: "FI", approved_vendor: true, iso_9001: { cert_id: "QC-42290", issued_on: "2024-09-01", expires_on: "2027-08-31" } },
  // Expired 10 May 2026.
  { id: "SUP-107", name: "Bramcote Fasteners Ltd", country: "GB", approved_vendor: true, iso_9001: { cert_id: "QC-37761", issued_on: "2023-05-11", expires_on: "2026-05-10" } },
  { id: "SUP-108", name: "Ilvento Coatings S.r.l.", country: "IT", approved_vendor: true, iso_9001: { cert_id: "QC-43018", issued_on: "2025-07-01", expires_on: "2028-06-30" } },
  // Expired 16 Aug 2026.
  { id: "SUP-109", name: "Marhaus Antriebe GmbH", country: "DE", approved_vendor: true, iso_9001: { cert_id: "QC-38804", issued_on: "2023-08-17", expires_on: "2026-08-16" } },
  // No ISO 9001 certificate on file at all.
  { id: "SUP-110", name: "Quellbrunn Elektro KG", country: "DE", approved_vendor: true, iso_9001: null },
  // Expires 27 Oct 2026 (3 days before receipt #58).
  { id: "SUP-111", name: "Saxwold Cables Ltd", country: "GB", approved_vendor: true, iso_9001: { cert_id: "QC-38125", issued_on: "2023-10-28", expires_on: "2026-10-27" } },
  // Edge case: expires 7 Oct 2026, two days after receipt #9 (still valid).
  { id: "SUP-112", name: "Fenwright Tools Ltd", country: "GB", approved_vendor: true, iso_9001: { cert_id: "QC-38000", issued_on: "2023-10-08", expires_on: "2026-10-07" } },
];

const budgets = [
  { id: "BUD-CC110-2026Q4", cost_center: "CC-110", name: "Production line A", period: "2026-Q4", budget_eur: 180000, committed_eur: 96500, available_eur: 83500 },
  { id: "BUD-CC220-2026Q4", cost_center: "CC-220", name: "Maintenance", period: "2026-Q4", budget_eur: 60000, committed_eur: 41500, available_eur: 18500 },
  { id: "BUD-CC310-2026Q4", cost_center: "CC-310", name: "Assembly", period: "2026-Q4", budget_eur: 140000, committed_eur: 62000, available_eur: 78000 },
  { id: "BUD-CC410-2026Q4", cost_center: "CC-410", name: "Drive units", period: "2026-Q4", budget_eur: 220000, committed_eur: 118000, available_eur: 102000 },
  { id: "BUD-CC520-2026Q4", cost_center: "CC-520", name: "Facilities", period: "2026-Q4", budget_eur: 45000, committed_eur: 33000, available_eur: 12000 },
];

type Contract = {
  id: string;
  supplier_id: string;
  title: string;
  item: string;
  unit_price_eur: number;
  valid_from: string;
  valid_until: string;
  passages: Array<{ id: string; text: string }>;
};

function contract(id: string, supplier_id: string, item: string, unit_price_eur: number, valid_from: string, valid_until: string): Contract {
  const supplier = suppliers.find((s) => s.id === supplier_id)!;
  return {
    id,
    supplier_id,
    title: `Frame agreement ${item} – ${supplier.name}`,
    item,
    unit_price_eur,
    valid_from,
    valid_until,
    passages: [
      { id: `${id}#p1`, text: `This frame agreement between Kesselfeld Antriebstechnik GmbH and ${supplier.name} (${supplier_id}) covers ${item}.` },
      { id: `${id}#p2`, text: `The agreed unit price is EUR ${unit_price_eur.toFixed(2)} per unit, fixed for the term of this agreement.` },
      { id: `${id}#p3`, text: `The agreement is valid from ${valid_from} until ${valid_until} inclusive.` },
    ],
  };
}

const contracts: Contract[] = [
  contract("CTR-2026-004", "SUP-101", "steel shafts", 18.4, "2026-01-01", "2026-12-31"),
  contract("CTR-2026-007", "SUP-102", "radial shaft seals", 2.6, "2026-01-01", "2026-12-31"),
  contract("CTR-2026-011", "SUP-103", "hydraulic couplings", 64.0, "2025-07-01", "2027-06-30"),
  contract("CTR-2026-031", "SUP-104", "ball bearings 6205", 42.0, "2026-01-01", "2026-12-31"),
  contract("CTR-2026-015", "SUP-105", "polymer housings", 7.25, "2026-03-01", "2027-02-28"),
  contract("CTR-2026-018", "SUP-106", "motor controllers", 112.0, "2026-01-01", "2026-12-31"),
  contract("CTR-2026-022", "SUP-108", "anti-corrosion coating", 31.5, "2026-02-01", "2027-01-31"),
  // Edge: valid until 17 Oct 2026 inclusive; receipt #33 is dated 17 Oct (valid).
  contract("CTR-2025-040", "SUP-112", "torque wrenches", 89.0, "2025-10-18", "2026-10-17"),
  // Expired 30 Sep 2026 (receipt #47 relies on it).
  contract("CTR-2025-036", "SUP-111", "shielded cables", 4.1, "2025-10-01", "2026-09-30"),
  contract("CTR-2026-027", "SUP-110", "control cabinets", 640.0, "2026-01-01", "2026-12-31"),
];

const policies = [
  {
    id: "POL-APPROVAL-01",
    title: "Single-approval limit",
    text: "An agent may approve a purchase order up to EUR 10,000 without human sign-off. Splitting one requirement into several orders to stay under this limit is not allowed. Orders to the same supplier and cost center within 72 hours are treated as one requirement.",
    limit_eur: 10000,
    window_hours: 72,
  },
];

// ---------- decisions ----------
type DecisionSpec = {
  n: number;
  date: string; // YYYY-MM-DD
  time: string;
  action: "approve_po" | "reject_po" | "release_payment";
  supplier: string;
  cc: string;
  amount: number; // amount the ERP holds
  claimedAmount?: number; // amount the agent states (defect if different)
  contract?: string | null; // contract the agent cites
  qty?: number;
  claimedUnitPrice?: number;
  claimsIso?: boolean;
  textOnly?: boolean;
  germanAmount?: boolean;
  extraFluff?: boolean;
  label: { bad: boolean; defect: string | null; note: string };
};

const SUPPLIER_CONTRACT: Record<string, string | undefined> = Object.fromEntries(
  contracts.filter((c) => c.id !== "CTR-2025-036" && c.id !== "CTR-2025-040").map((c) => [c.supplier_id, c.id]),
);
const SUPPLIER_CC: Record<string, string[]> = {
  "SUP-101": ["CC-110", "CC-410"],
  "SUP-102": ["CC-220", "CC-410"],
  "SUP-103": ["CC-110", "CC-310"],
  "SUP-104": ["CC-410"],
  "SUP-105": ["CC-310"],
  "SUP-106": ["CC-410", "CC-310"],
  "SUP-108": ["CC-110", "CC-310"],
  "SUP-110": ["CC-520", "CC-310"],
  "SUP-112": ["CC-220"],
};
// Suppliers with a valid cert for the whole of October 2026 (safe for good decisions).
const SAFE_SUPPLIERS = ["SUP-101", "SUP-102", "SUP-103", "SUP-105", "SUP-106", "SUP-108"];

const BAD: Record<number, Partial<DecisionSpec> & { label: DecisionSpec["label"] }> = {
  14: { supplier: "SUP-104", cc: "CC-410", amount: 8400, contract: "CTR-2026-031", qty: 200, claimedUnitPrice: 42.0, claimsIso: true, label: { bad: true, defect: "expired_certificate", note: "SUP-104 ISO 9001 cert QC-55120 expired 2026-02-07, eight months before approval." } },
  19: { time: "16:40", supplier: "SUP-106", cc: "CC-410", amount: 9750, contract: "CTR-2026-018", claimsIso: true, label: { bad: true, defect: "split_order", note: "Completes a split with receipt #18 (PO-4518, same supplier and cost center, about 32 hours earlier): EUR 19,550 combined, above the EUR 10,000 single-approval limit." } },
  22: { supplier: "SUP-103", cc: "CC-110", amount: 6900, contract: "CTR-2026-099", claimsIso: true, label: { bad: true, defect: "nonexistent_contract", note: "Cites CTR-2026-099, which does not exist in the contract repository." } },
  24: { supplier: "SUP-101", cc: "CC-410", amount: 17250, claimedAmount: 12750, contract: "CTR-2026-004", claimsIso: true, label: { bad: true, defect: "amount_mismatch", note: "Agent states EUR 12,750; ERP PO is EUR 17,250 (digits transposed)." } },
  27: { supplier: "SUP-102", cc: "CC-220", amount: 31000, contract: "CTR-2026-007", claimsIso: true, label: { bad: true, defect: "budget_exceeded", note: "CC-220 has EUR 18,500 available; order is EUR 31,000." } },
  31: { supplier: "SUP-109", cc: "CC-110", amount: 5600, contract: null, claimsIso: true, textOnly: true, label: { bad: true, defect: "expired_certificate", note: "SUP-109 cert QC-38804 expired 2026-08-16, two months before approval. Free-text log only." } },
  35: { supplier: "SUP-105", cc: "CC-310", amount: 4350, contract: "CTR-2026-061", claimsIso: true, textOnly: true, label: { bad: true, defect: "nonexistent_contract", note: "Cites CTR-2026-061, which does not exist. Free-text log only." } },
  38: { supplier: "SUP-102", cc: "CC-410", amount: 7750, contract: "CTR-2026-007", qty: 2500, claimedUnitPrice: 3.1, claimsIso: true, textOnly: true, label: { bad: true, defect: "unit_price_mismatch", note: "Agent says EUR 3.10/unit matches CTR-2026-007; contract price is EUR 2.60. Free-text log only." } },
  41: { supplier: "SUP-110", cc: "CC-520", amount: 14200, contract: "CTR-2026-027", claimsIso: false, textOnly: true, label: { bad: true, defect: "budget_exceeded", note: "CC-520 has EUR 12,000 available; order is EUR 14,200. Free-text log only." } },
  44: { supplier: "SUP-107", cc: "CC-310", amount: 46200, contract: null, claimsIso: true, label: { bad: true, defect: "expired_certificate", note: "SUP-107 cert QC-37761 expired 2026-05-10." } },
  47: { supplier: "SUP-111", cc: "CC-410", amount: 6150, contract: "CTR-2025-036", qty: 1500, claimedUnitPrice: 4.1, claimsIso: true, label: { bad: true, defect: "expired_contract", note: "CTR-2025-036 ended 2026-09-30; approval relies on its pricing on 2026-10-24." } },
  50: { supplier: "SUP-108", cc: "CC-110", amount: 9450, claimedAmount: 4950, contract: "CTR-2026-022", claimsIso: true, label: { bad: true, defect: "amount_mismatch", note: "Agent states EUR 4,950; ERP PO is EUR 9,450." } },
  53: { supplier: "SUP-110", cc: "CC-310", amount: 12800, contract: "CTR-2026-027", claimsIso: true, label: { bad: true, defect: "certificate_not_on_file", note: "Agent claims SUP-110 is ISO 9001 certified; supplier DB has no certificate at all." } },
  56: { supplier: "SUP-101", cc: "CC-220", amount: 22400, contract: "CTR-2026-004", claimsIso: true, label: { bad: true, defect: "budget_exceeded", note: "CC-220 has EUR 18,500 available; order is EUR 22,400." } },
  58: { supplier: "SUP-111", cc: "CC-410", amount: 3900, contract: null, claimsIso: true, label: { bad: true, defect: "expired_certificate", note: "SUP-111 cert QC-38125 expired 2026-10-27, three days before approval." } },
};

// Good decisions with deliberate edge cases.
const EDGE: Record<number, Partial<DecisionSpec> & { label: DecisionSpec["label"] }> = {
  9: { supplier: "SUP-112", cc: "CC-220", amount: 3560, contract: null, claimsIso: true, label: { bad: false, defect: null, note: "Edge: SUP-112 cert expires 2026-10-07, two days after approval. Still valid." } },
  12: { supplier: "SUP-102", cc: "CC-220", amount: 18500, contract: "CTR-2026-007", claimsIso: true, label: { bad: true, defect: "over_approval_limit", note: "EUR 18,500 approved by the agent without human sign-off; POL-APPROVAL-01 allows at most EUR 10,000. (Budget edge: amount equals the CC-220 available budget exactly, which on its own is fine.) Relabelled bad in the manual review, 8 Nov 2026." } },
  16: { supplier: "SUP-105", cc: "CC-310", amount: 8400, contract: "CTR-2026-015", claimsIso: true, textOnly: true, germanAmount: true, label: { bad: false, defect: null, note: "Edge: amount written in German format (e.g. 8.402,75 EUR) in a free-text log." } },
  18: { time: "09:05", supplier: "SUP-106", cc: "CC-410", amount: 9800, contract: "CTR-2026-018", claimsIso: true, label: { bad: false, defect: null, note: "First half of the split completed by #19. On its own this approval is within policy." } },
  33: { supplier: "SUP-112", cc: "CC-220", amount: 2670, contract: "CTR-2025-040", qty: 30, claimedUnitPrice: 89.0, claimsIso: true, label: { bad: false, defect: null, note: "Edge: contract CTR-2025-040 valid until 2026-10-17 inclusive, same day as approval. Valid. (SUP-112 cert has expired by now, so the agent makes no ISO claim.)" } },
};
EDGE[33]!.claimsIso = false;

const REJECTS: Record<number, Partial<DecisionSpec> & { label: DecisionSpec["label"] }> = {
  26: { action: "reject_po", supplier: "SUP-107", cc: "CC-110", amount: 5200, contract: null, label: { bad: false, defect: null, note: "Correct rejection: SUP-107 cert expired." } },
  43: { action: "reject_po", supplier: "SUP-109", cc: "CC-310", amount: 7300, contract: null, label: { bad: false, defect: null, note: "Correct rejection: SUP-109 cert expired." } },
  55: { action: "reject_po", supplier: "SUP-102", cc: "CC-220", amount: 26000, contract: "CTR-2026-007", label: { bad: false, defect: null, note: "Correct rejection: exceeds CC-220 budget." } },
};

const TEXT_ONLY_GOOD = new Set([5, 11, 29, 36, 45, 52, 59]);
const PAYMENTS = new Set([8, 21, 34, 48, 57]);
const FLUFF = new Set([3, 10, 14, 20, 28, 37, 44, 49]);

const specs: DecisionSpec[] = [];
for (let n = 1; n <= 60; n += 1) {
  const day = Math.min(31, 1 + Math.floor(((n - 1) * 31) / 60));
  const baseDate = `2026-10-${String(day).padStart(2, "0")}`;
  const time = `${String(8 + Math.floor(rand() * 9)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
  const override = BAD[n] ?? EDGE[n] ?? REJECTS[n];
  let spec: DecisionSpec;
  if (override) {
    spec = {
      n,
      date: baseDate,
      time,
      action: "approve_po",
      supplier: "SUP-101",
      cc: "CC-110",
      amount: 1000,
      ...override,
    } as DecisionSpec;
  } else {
    // Keep random clean orders from forming an accidental split order with an
    // earlier approval (same supplier + cost center within 72h). See BUILD_LOG 2026-11-07.
    let supplier = pick(SAFE_SUPPLIERS);
    let cc = pick(SUPPLIER_CC[supplier]!);
    const day = Math.min(31, 1 + Math.floor(((n - 1) * 31) / 60));
    const planted = Object.entries({ ...BAD, ...EDGE }).map(([k, o]) => ({
      supplier: o.supplier!,
      cc: o.cc!,
      day: Math.min(31, 1 + Math.floor(((Number(k) - 1) * 31) / 60)),
    }));
    const clashes = (sup: string, c: string) =>
      specs.some((o) => o.supplier === sup && o.cc === c && o.action === "approve_po" && day - Number(o.date.slice(8, 10)) <= 3) ||
      planted.some((o) => o.supplier === sup && o.cc === c && Math.abs(o.day - day) <= 3);
    for (let tries = 0; tries < 20 && clashes(supplier, cc); tries += 1) {
      supplier = pick(SAFE_SUPPLIERS);
      cc = pick(SUPPLIER_CC[supplier]!);
    }
    const budget = budgets.find((b) => b.cost_center === cc)!;
    const maxAmount = Math.min(9900, budget.available_eur);
    spec = {
      n,
      date: baseDate,
      time,
      action: PAYMENTS.has(n) ? "release_payment" : "approve_po",
      supplier,
      cc,
      amount: amount(900, maxAmount),
      contract: rand() < 0.7 ? SUPPLIER_CONTRACT[supplier] ?? null : null,
      claimsIso: rand() < 0.75,
      label: { bad: false, defect: null, note: "Clean decision: all stated facts match the systems of record." },
    };
  }
  if (spec.contract === undefined) spec.contract = null;
  if (spec.claimsIso === undefined) spec.claimsIso = true;
  if (TEXT_ONLY_GOOD.has(n)) spec.textOnly = true;
  if (FLUFF.has(n)) spec.extraFluff = true;
  // Only quote a unit price when the order quantity divides cleanly at contract price.
  if (spec.qty === undefined && spec.contract && !BAD[n] && !REJECTS[n] && (!EDGE[n] || n === 16)) {
    const c = contracts.find((x) => x.id === spec.contract);
    if (c && rand() < 0.5) {
      const qty = Math.max(1, Math.round(spec.amount / c.unit_price_eur));
      spec.qty = qty;
      spec.amount = Math.round(qty * c.unit_price_eur * 100) / 100;
      spec.claimedUnitPrice = c.unit_price_eur;
    }
  }
  specs.push(spec);
}

// ---------- ERP purchase orders ----------
const purchaseOrders = specs.map((s) => ({
  id: `PO-${4500 + s.n}`,
  supplier_id: s.supplier,
  cost_center: s.cc,
  amount_eur: s.amount,
  currency: "EUR",
  quantity: s.qty ?? null,
  created_on: s.date,
  requested_by: pick(["J. Okafor-Brandt", "M. Lindahl", "S. Varga", "T. Hollis"]),
  status: s.action === "reject_po" ? "rejected" : s.action === "release_payment" ? "paid" : "approved",
}));
// Background POs the agent never touched (makes the ERP less trivially 1:1).
for (let i = 0; i < 25; i += 1) {
  const supplier = pick(suppliers).id;
  purchaseOrders.push({
    id: `PO-${4300 + i}`,
    supplier_id: supplier,
    cost_center: pick(budgets).cost_center,
    amount_eur: amount(500, 20000),
    currency: "EUR",
    quantity: null,
    created_on: `2026-09-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
    requested_by: pick(["J. Okafor-Brandt", "M. Lindahl", "S. Varga", "T. Hollis"]),
    status: "closed",
  });
}

// ---------- rationale text ----------
type GoldClaim = { type: string; params: Record<string, unknown> };

function money(s: DecisionSpec, n: number): string {
  if (s.germanAmount) return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  return eur(n);
}

function buildDecision(s: DecisionSpec) {
  const supplier = suppliers.find((x) => x.id === s.supplier)!;
  const po = `PO-${4500 + s.n}`;
  const stated = s.claimedAmount ?? s.amount;
  const gold: GoldClaim[] = [];
  const parts: string[] = [];

  if (s.action === "reject_po") {
    parts.push(`Rejected ${po} (${money(s, stated)}) from ${supplier.name} (${s.supplier}).`);
    gold.push({ type: "po_exists", params: { po_id: po } });
    gold.push({ type: "po_amount", params: { po_id: po, amount_eur: stated } });
    gold.push({ type: "po_supplier", params: { po_id: po, supplier_id: s.supplier } });
    if (s.n === 55) {
      parts.push(`Cost center ${s.cc} does not have enough budget left for this order.`);
      gold.push({ type: "budget_available", params: { cost_center: s.cc, amount_eur: stated, claimed_available: false } });
    } else {
      parts.push(`The supplier's ISO 9001 certificate ${supplier.iso_9001?.cert_id} has expired, so the order cannot be placed.`);
      gold.push({ type: "supplier_iso_certified", params: { supplier_id: s.supplier, claimed_valid: false } });
    }
    return { po, text: parts.join(" "), gold };
  }

  const verb = s.action === "release_payment" ? pick(["Released payment for", "Paid"]) : pick(["Approved", "Approved purchase order", "Auto-approved"]);
  parts.push(`${verb} ${po} for ${money(s, stated)} to ${supplier.name} (${s.supplier}), cost center ${s.cc}.`);
  gold.push({ type: "po_exists", params: { po_id: po } });
  gold.push({ type: "po_amount", params: { po_id: po, amount_eur: stated } });
  gold.push({ type: "po_supplier", params: { po_id: po, supplier_id: s.supplier } });

  if (s.claimsIso) {
    const cert = supplier.iso_9001?.cert_id;
    parts.push(
      cert
        ? pick([`Supplier is ISO 9001 certified (certificate ${cert}).`, `${supplier.name} holds a valid ISO 9001 certificate (${cert}).`, `Quality check passed: ISO 9001 cert ${cert} is valid.`])
        : `Supplier is ISO 9001 certified.`,
    );
    gold.push({ type: "supplier_iso_certified", params: { supplier_id: s.supplier, claimed_valid: true } });
  }
  if (s.contract) {
    if (s.claimedUnitPrice && s.qty) {
      parts.push(`Pricing follows frame contract ${s.contract} at ${eur(s.claimedUnitPrice)} per unit for ${s.qty} units.`);
      gold.push({ type: "contract_exists", params: { contract_id: s.contract } });
      gold.push({ type: "contract_valid", params: { contract_id: s.contract } });
      gold.push({ type: "contract_supplier", params: { contract_id: s.contract, supplier_id: s.supplier } });
      gold.push({ type: "contract_unit_price", params: { contract_id: s.contract, unit_price_eur: s.claimedUnitPrice } });
    } else {
      parts.push(pick([`Covered by frame contract ${s.contract}.`, `Terms per contract ${s.contract}, which is in force.`]));
      gold.push({ type: "contract_exists", params: { contract_id: s.contract } });
      gold.push({ type: "contract_valid", params: { contract_id: s.contract } });
      gold.push({ type: "contract_supplier", params: { contract_id: s.contract, supplier_id: s.supplier } });
    }
  }
  if (s.action === "approve_po") {
    parts.push(pick([`Budget available in ${s.cc}.`, `${s.cc} has sufficient budget for this order.`, `Within the Q4 budget of ${s.cc}.`]));
    gold.push({ type: "budget_available", params: { cost_center: s.cc, amount_eur: stated, claimed_available: true } });
  }
  if (s.extraFluff) {
    parts.push(pick(["Supplier has a reliable delivery history.", "Lead time is acceptable for production planning.", "Requester confirmed the need by email."]));
  }
  return { po, text: parts.join(" "), gold };
}

const finalGold: Array<{ decision_id: string; claims: GoldClaim[] }> = [];
const finalDecisions = specs.map((s) => {
  const built = buildDecision(s);
  const id = `D-${String(s.n).padStart(3, "0")}`;
  finalGold.push({ decision_id: id, claims: built.gold });
  // Structured tool-call payload the agent emitted (absent for the legacy free-text agent).
  const structured = s.textOnly
    ? null
    : {
        po_id: built.po,
        supplier_id: s.supplier,
        amount_eur: s.claimedAmount ?? s.amount,
        cost_center: s.cc,
        contract_id: s.contract ?? null,
        iso_certified: s.action === "reject_po" ? (s.n === 55 ? null : false) : s.claimsIso ? true : null,
        budget_available: s.action === "approve_po" ? true : s.n === 55 ? false : null,
      };
  return {
    id,
    receipt_no: s.n,
    timestamp: `${s.date}T${s.time}:00Z`,
    agent: s.textOnly ? "procure-agent v1.8 (legacy, free-text log)" : "procure-agent v2.3",
    action: s.action,
    agent_log_status: "success",
    rationale: built.text,
    tool_call: structured,
  };
});

const groundTruth = specs.map((s) => ({
  decision_id: `D-${String(s.n).padStart(3, "0")}`,
  receipt_no: s.n,
  label_pass1: s.label.bad ? "bad" : "good",
  defect_type: s.label.defect,
  note: s.label.note,
}));

// ---------- pending requests for the built-in live agent (no PRNG: earlier output unchanged) ----------
// The live agent decides these in real time. Its supplier tool reads a STALE cache
// (data/agent-cache/suppliers.json, snapshot of 15 Jan 2026): a deliberately injected,
// documented failure mode. See README "Built-in agent".
const pending = [
  { po: "PO-4601", supplier: "SUP-104", cc: "CC-410", qty: 180, contract: "CTR-2026-031", item: "ball bearings 6205", requester: "M. Lindahl" },
  { po: "PO-4602", supplier: "SUP-101", cc: "CC-110", qty: 400, contract: "CTR-2026-004", item: "steel shafts", requester: "S. Varga" },
  { po: "PO-4603", supplier: "SUP-102", cc: "CC-220", qty: 9230, contract: "CTR-2026-007", item: "radial shaft seals", requester: "T. Hollis" },
  { po: "PO-4604", supplier: "SUP-105", cc: "CC-310", qty: 1000, contract: "CTR-2026-015", item: "polymer housings", requester: "J. Okafor-Brandt" },
  { po: "PO-4605", supplier: "SUP-107", cc: "CC-310", qty: 4000, contract: null, unitPrice: 0.8, item: "M8 fasteners", requester: "S. Varga" },
  { po: "PO-4606", supplier: "SUP-108", cc: "CC-110", qty: 200, contract: "CTR-2026-022", item: "anti-corrosion coating", requester: "M. Lindahl" },
];
const requests = pending.map((r) => {
  const price = r.contract ? contracts.find((c) => c.id === r.contract)!.unit_price_eur : r.unitPrice!;
  const amount = Math.round(r.qty * price * 100) / 100;
  purchaseOrders.push({
    id: r.po, supplier_id: r.supplier, cost_center: r.cc, amount_eur: amount, currency: "EUR", quantity: r.qty,
    created_on: "2026-11-02", requested_by: r.requester, status: "pending_approval",
  });
  return { po_id: r.po, requested_by: r.requester, request: `Please approve ${r.po}: ${r.qty} × ${r.item} from ${suppliers.find((s) => s.id === r.supplier)!.name} for cost center ${r.cc}.` };
});
const CACHE_DATE = "2026-01-15";
const supplierCache = suppliers.map((s) => ({
  id: s.id,
  name: s.name,
  approved_vendor: s.approved_vendor,
  iso_certified: Boolean(s.iso_9001 && s.iso_9001.expires_on >= CACHE_DATE),
  cert_id: s.iso_9001?.cert_id ?? null,
  cached_on: CACHE_DATE,
}));

function write(rel: string, value: unknown) {
  const path = join(ROOT, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

write("data/suppliers.json", suppliers);
write("data/budgets.json", budgets);
write("data/contracts.json", contracts);
write("data/policies.json", policies);
write("data/erp_purchase_orders.json", purchaseOrders);
write("data/decisions.json", finalDecisions);
write("labels/ground-truth.json", groundTruth);
write("labels/gold-claims.json", finalGold);
write("data/requests.json", requests);
write("data/agent-cache/suppliers.json", supplierCache);
console.log(`Wrote ${finalDecisions.length} decisions, ${purchaseOrders.length} POs, ${suppliers.length} suppliers, ${contracts.length} contracts.`);
console.log(`Bad (pass 1): ${groundTruth.filter((g) => g.label_pass1 === "bad").length}`);
