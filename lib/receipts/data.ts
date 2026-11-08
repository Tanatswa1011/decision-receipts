/**
 * Synthetic systems of record, loaded from data/*.json.
 * Every record has an `id`; that id is the evidence ID a verdict cites.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  cost_center: string;
  amount_eur: number;
  currency: string;
  quantity: number | null;
  created_on: string;
  requested_by: string;
  status: string;
};
export type Supplier = {
  id: string;
  name: string;
  country: string;
  approved_vendor: boolean;
  iso_9001: { cert_id: string; issued_on: string; expires_on: string } | null;
};
export type Budget = {
  id: string;
  cost_center: string;
  name: string;
  period: string;
  budget_eur: number;
  committed_eur: number;
  available_eur: number;
};
export type Contract = {
  id: string;
  supplier_id: string;
  title: string;
  item: string;
  unit_price_eur: number;
  valid_from: string;
  valid_until: string;
  passages: Array<{ id: string; text: string }>;
};
export type Policy = { id: string; title: string; text: string; limit_eur: number; window_hours: number };

export type Decision = {
  id: string;
  receipt_no: number;
  timestamp: string;
  agent: string;
  action: "approve_po" | "reject_po" | "release_payment";
  agent_log_status: string;
  rationale: string;
  tool_call: {
    po_id: string;
    supplier_id: string;
    amount_eur: number;
    cost_center: string;
    contract_id: string | null;
    iso_certified: boolean | null;
    budget_available: boolean | null;
  } | null;
  /** Live telemetry only (absent for the static synthetic file). */
  live?: {
    source: "replay" | "live_agent" | "external";
    run_id: string;
    /** What the agent's own lookup steps returned, keyed by resource_id (e.g. SUP-104). Display only. */
    agent_saw: Record<string, Record<string, unknown>>;
  };
};

export type SystemsOfRecord = {
  purchaseOrders: Map<string, PurchaseOrder>;
  suppliers: Map<string, Supplier>;
  budgets: Map<string, Budget>; // keyed by cost center
  contracts: Map<string, Contract>;
  policies: Map<string, Policy>;
};

export type GroundTruth = {
  decision_id: string;
  receipt_no: number;
  label_pass1: "good" | "bad";
  defect_type: string | null;
  note: string;
};

const ROOT = process.cwd();

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export function loadSystems(): SystemsOfRecord {
  return {
    purchaseOrders: byId(readJson<PurchaseOrder[]>("data/erp_purchase_orders.json")),
    suppliers: byId(readJson<Supplier[]>("data/suppliers.json")),
    budgets: new Map(readJson<Budget[]>("data/budgets.json").map((b) => [b.cost_center, b])),
    contracts: byId(readJson<Contract[]>("data/contracts.json")),
    policies: byId(readJson<Policy[]>("data/policies.json")),
  };
}

export function loadDecisions(): Decision[] {
  return readJson<Decision[]>("data/decisions.json");
}

export function loadGroundTruth(): GroundTruth[] {
  return readJson<GroundTruth[]>("labels/ground-truth.json");
}

/** Look up any evidence ID across all systems (for the evidence viewer). */
export function findEvidence(systems: SystemsOfRecord, decisions: Decision[], evidenceId: string):
  | { system: string; record: unknown; passage?: { id: string; text: string } }
  | null {
  const [base, fragment] = evidenceId.split("#");
  const key = base!;
  const po = systems.purchaseOrders.get(key);
  if (po) return { system: "ERP purchase orders", record: po };
  const supplier = systems.suppliers.get(key);
  if (supplier) return { system: "Supplier database", record: supplier };
  const budget = [...systems.budgets.values()].find((b) => b.id === key);
  if (budget) return { system: "Budget table", record: budget };
  const contract = systems.contracts.get(key);
  if (contract) {
    const passage = fragment ? contract.passages.find((p) => p.id === evidenceId) : undefined;
    if (fragment && !passage) return null;
    return { system: "Contract repository", record: contract, passage };
  }
  const policy = systems.policies.get(key);
  if (policy) return { system: "Policy register", record: policy };
  const decision = decisions.find((d) => d.id === key);
  if (decision) return { system: "Agent decision log", record: decision };
  return null;
}
