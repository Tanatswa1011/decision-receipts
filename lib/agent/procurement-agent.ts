/**
 * Built-in procurement agent: the free replacement for the n8n workflow.
 *
 * A real tool-calling LLM agent (any provider from Settings) decides pending purchase
 * requests. Every tool call and the final decision are sent as ACPT telemetry over HTTP
 * to /api/events, the same boundary an n8n HTTP Request node or any external agent uses.
 *
 * DELIBERATE, DOCUMENTED FAILURE MODE: `lookup_supplier` reads a stale supplier cache
 * (data/agent-cache/suppliers.json, snapshot of 15 Jan 2026), the kind of thing that
 * makes real agents approve on an expired certificate. The receipt then checks against
 * the live supplier database. Everything else the tools return is the system of record.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Emitter } from "@/lib/live/emit";
import { lifecycle, step } from "@/lib/live/emit";
import { loadSystems } from "@/lib/receipts/data";
import { post, type LlmConfig } from "@/lib/receipts/llm";

export type PurchaseRequest = { po_id: string; requested_by: string; request: string };

export function loadRequests(): PurchaseRequest[] {
  return JSON.parse(readFileSync(join(process.cwd(), "data", "requests.json"), "utf8"));
}

const SYSTEM = `You are the procurement approval agent of Kesselfeld Antriebstechnik GmbH.
Decide one pending purchase order. Use the tools to look things up, then call submit_decision exactly once.
Company policy:
- Approve only if the supplier holds a valid ISO 9001 certificate, the cost center has budget for the full amount, and, if a frame contract is cited, it is in force and covers this supplier.
- Orders above EUR 10,000 must be rejected (they need human sign-off).
- In submit_decision, report the facts you relied on exactly as your tools returned them, and give a short rationale that names the PO, supplier and contract IDs.`;

type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required, additionalProperties: false });
const S = { type: "string" };

const TOOLS: ToolDef[] = [
  { name: "lookup_po", description: "Read a purchase order from the ERP.", parameters: obj({ po_id: S }, ["po_id"]) },
  { name: "lookup_supplier", description: "Read a supplier's master data incl. ISO 9001 status (from the supplier cache).", parameters: obj({ supplier_id: S }, ["supplier_id"]) },
  { name: "lookup_contract", description: "Read a frame contract by ID, or find the contract for a supplier.", parameters: obj({ contract_id: S, supplier_id: S }, []) },
  { name: "check_budget", description: "Read the Q4 2026 budget of a cost center.", parameters: obj({ cost_center: S }, ["cost_center"]) },
  {
    name: "submit_decision",
    description: "Submit the final decision. Call exactly once.",
    parameters: obj(
      {
        decision: { type: "string", enum: ["approve", "reject"] },
        po_id: S,
        supplier_id: S,
        amount_eur: { type: "number" },
        cost_center: S,
        contract_id: { type: ["string", "null"] },
        iso_certified: { type: "boolean" },
        budget_available: { type: "boolean" },
        rationale: S,
      },
      ["decision", "po_id", "supplier_id", "amount_eur", "cost_center", "contract_id", "iso_certified", "budget_available", "rationale"],
    ),
  },
];

function runTool(name: string, args: Record<string, any>): { resource_id: string; result: Record<string, unknown> } {
  const db = loadSystems();
  switch (name) {
    case "lookup_po": {
      const po = db.purchaseOrders.get(String(args.po_id));
      return { resource_id: String(args.po_id), result: po ? { ...po } : { error: "not found" } };
    }
    case "lookup_supplier": {
      const cache: Array<Record<string, unknown>> = JSON.parse(readFileSync(join(process.cwd(), "data", "agent-cache", "suppliers.json"), "utf8"));
      const hit = cache.find((s) => s.id === args.supplier_id);
      return { resource_id: String(args.supplier_id), result: hit ?? { error: "not found" } };
    }
    case "lookup_contract": {
      const c = args.contract_id ? db.contracts.get(String(args.contract_id)) : [...db.contracts.values()].find((x) => x.supplier_id === args.supplier_id && x.valid_until >= new Date().toISOString().slice(0, 10));
      if (!c) return { resource_id: String(args.contract_id ?? args.supplier_id ?? "contract"), result: { error: "not found" } };
      const { passages: _p, ...rest } = c;
      return { resource_id: c.id, result: rest };
    }
    case "check_budget": {
      const b = db.budgets.get(String(args.cost_center));
      return { resource_id: String(args.cost_center), result: b ? { cost_center: b.cost_center, period: b.period, available_eur: b.available_eur } : { error: "not found" } };
    }
    default:
      return { resource_id: name, result: { error: "unknown tool" } };
  }
}

type Call = { id: string; name: string; args: Record<string, any> };
type Turn = { calls: Call[]; text: string; usage: { input: number; output: number } };

async function openAiTurn(cfg: LlmConfig, messages: any[]): Promise<Turn> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    tools: TOOLS.map((t) => ({ type: "function", function: t })),
    tool_choice: "auto",
  };
  if (cfg.sendTemperature) body.temperature = 0;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const res = await post(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  const msg = json.choices?.[0]?.message ?? {};
  messages.push(msg);
  const calls: Call[] = (msg.tool_calls ?? []).map((c: any) => {
    let args: Record<string, any> = {};
    try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* bad JSON args -> empty; tool returns an error */ }
    return { id: c.id, name: c.function.name, args };
  });
  return { calls, text: msg.content ?? "", usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 } };
}

async function anthropicTurn(cfg: LlmConfig, messages: any[]): Promise<Turn> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 1500,
    system: SYSTEM,
    messages,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
  };
  if (cfg.sendTemperature) body.temperature = 0;
  const res = await post(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": cfg.apiKey ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  messages.push({ role: "assistant", content: json.content });
  const calls: Call[] = (json.content ?? []).filter((b: any) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, args: b.input ?? {} }));
  const text = (json.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { calls, text, usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 } };
}

export type AgentRunResult = {
  run_id: string;
  po_id: string;
  decision: "approve" | "reject" | null;
  receipt: any;
  tool_calls: number;
  tokens: { input: number; output: number };
  model_ms: number;
  wall_ms: number;
  error: string | null;
};

export async function runAgentOnRequest(req: PurchaseRequest, cfg: LlmConfig, emitter: Emitter, maxTurns = 8): Promise<AgentRunResult> {
  const t0 = performance.now();
  const run_id = `live-${req.po_id}-${Date.now().toString(36)}`;
  const base = { agent_id: "procure-agent-live", external_run_id: run_id };
  let seq = 0;
  const tokens = { input: 0, output: 0 };
  let modelMs = 0;
  let toolCalls = 0;
  await emitter.send(lifecycle(base, "run.started", seq++, { source: "live_agent", model: cfg.model, provider: cfg.provider }));

  const user = `Pending request from ${req.requested_by}: ${req.request}\nToday is ${new Date().toISOString().slice(0, 10)}.`;
  const messages: any[] = cfg.protocol === "anthropic" ? [{ role: "user", content: user }] : [{ role: "system", content: SYSTEM }, { role: "user", content: user }];

  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const m0 = performance.now();
      const out = cfg.protocol === "anthropic" ? await anthropicTurn(cfg, messages) : await openAiTurn(cfg, messages);
      modelMs += performance.now() - m0;
      tokens.input += out.usage.input;
      tokens.output += out.usage.output;
      if (out.calls.length === 0) {
        messages.push({ role: "user", content: "Call submit_decision now." });
        continue;
      }
      const results: Array<{ id: string; content: string }> = [];
      for (const call of out.calls) {
        toolCalls += 1;
        if (call.name === "submit_decision") {
          const a = call.args;
          const decision = a.decision === "approve" ? "approve" : "reject";
          await emitter.send(step(base, seq++, {
            tool: "procurement",
            action: decision === "approve" ? "po.approve" : "po.reject",
            resource_id: String(a.po_id ?? req.po_id),
            after_state: {
              po_id: a.po_id, supplier_id: a.supplier_id, amount_eur: a.amount_eur, cost_center: a.cost_center,
              contract_id: a.contract_id ?? null, iso_certified: a.iso_certified, budget_available: a.budget_available,
            },
            risk_metadata: { source: "live_agent", rationale: String(a.rationale ?? ""), model: cfg.model },
          }));
          const done = await emitter.send(lifecycle(base, "run.completed", seq++, { source: "live_agent" }));
          return { run_id, po_id: req.po_id, decision, receipt: done.body?.receipt ?? null, tool_calls: toolCalls, tokens, model_ms: modelMs, wall_ms: performance.now() - t0, error: null };
        }
        const { resource_id, result } = runTool(call.name, call.args);
        await emitter.send(step(base, seq++, { tool: call.name === "lookup_supplier" ? "supplier-cache" : "erp", action: call.name, resource_id, after_state: result }));
        results.push({ id: call.id, content: JSON.stringify(result) });
      }
      if (cfg.protocol === "anthropic") messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) });
      else for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
    throw new Error(`no decision after ${maxTurns} turns`);
  } catch (error) {
    const message = (error as Error).message.replace(/(sk|sk-ant|gsk|AIza)[-_A-Za-z0-9]{8,}/g, "[redacted]");
    await emitter.send(step(base, seq++, { tool: "procurement", action: "decide", resource_id: req.po_id, after_state: null, failed: true, risk_metadata: { error: message.slice(0, 300) } })).catch(() => undefined);
    await emitter.send(lifecycle(base, "run.completed", seq++, { source: "live_agent" })).catch(() => undefined);
    return { run_id, po_id: req.po_id, decision: null, receipt: null, tool_calls: toolCalls, tokens, model_ms: modelMs, wall_ms: performance.now() - t0, error: message };
  }
}
