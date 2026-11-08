/**
 * The model's one narrow job: split a free-text decision rationale into atomic,
 * typed claims. It never sees the systems of record and never sets a verdict.
 *
 * Bring your own key: OpenAI-compatible /chat/completions (OpenAI, Gemini, Mistral,
 * Groq, OpenRouter, Ollama, Langdock, any custom URL) or Anthropic /messages.
 * See lib/receipts/providers.ts. Langdock is UNTESTED.
 */
import { ExtractionOutputSchema, type Claim, type ExtractedClaim } from "@/lib/receipts/claims";
import type { Decision } from "@/lib/receipts/data";
import { resolveProvider, type ProviderId } from "@/lib/receipts/providers";

export const EXTRACTION_PROMPT_VERSION = "extract-v1";

const SYSTEM_PROMPT = `You split a procurement agent's decision note into atomic factual claims.
Return JSON only: {"claims":[{"type":..., "quote":..., "params":{...}}]}.
"quote" must be copied verbatim from the note (the shortest span that states the claim).
Do not judge whether a claim is true. Do not add facts that are not in the note.
Copy IDs exactly as written. Amounts are numbers in EUR (e.g. "8.402,75 EUR" -> 8402.75, "€12,750.00" -> 12750).

Allowed types and params (no other keys):
- po_exists {po_id}                         the note names a purchase order
- po_amount {po_id, amount_eur}             the note states the order amount
- po_supplier {po_id, supplier_id}          the note says which supplier the order is for (use the SUP-... id)
- supplier_iso_certified {supplier_id, claimed_valid}   true if the note says the supplier holds a valid ISO 9001 cert, false if it says it expired / is missing
- contract_exists {contract_id}             the note cites a contract
- contract_valid {contract_id}              the note relies on a cited contract being in force (any reliance on a cited contract implies this)
- contract_supplier {contract_id, supplier_id}  the cited contract is relied on for this supplier
- contract_unit_price {contract_id, unit_price_eur}  the note states a per-unit price from the contract
- budget_available {cost_center, amount_eur, claimed_available}  true if the note says the cost center has budget for the order amount, false if it says it does not
- out_of_scope {}  (params must be {}) any other factual statement that is not one of the above`;

export type LlmConfig = {
  provider: ProviderId;
  providerLabel: string;
  protocol: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string | null;
  model: string;
  sendTemperature: boolean;
  jsonMode: boolean;
};

/** Bring your own key: provider is LLM_PROVIDER, or whichever key is present in .env. */
export function llmConfigFromEnv(opts: { provider?: string; model?: string } = {}): LlmConfig {
  const r = resolveProvider(opts);
  return {
    provider: r.spec.id,
    providerLabel: r.spec.label,
    protocol: r.spec.protocol,
    baseUrl: r.baseUrl,
    apiKey: r.apiKey,
    model: r.model,
    // Reasoning models (gpt-5*, o*) only accept the default temperature.
    sendTemperature: process.env.LLM_SEND_TEMPERATURE !== "0" && !/^(openai\/)?(gpt-5|o\d)/.test(r.model),
    jsonMode: r.spec.supportsJsonMode,
  };
}

export async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
    throw new Error(`Could not reach ${new URL(url).host} (${cause}). Check the base URL and your connection.`);
  }
}

type RawCompletion = { raw: string; usage: { prompt_tokens: number; completion_tokens: number } | null };

async function callOpenAiCompatible(decision: Decision, cfg: LlmConfig): Promise<RawCompletion> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Action: ${decision.action}\nNote: ${decision.rationale}` },
    ],
  };
  if (cfg.jsonMode) body.response_format = { type: "json_object" };
  if (cfg.sendTemperature) body.temperature = 0;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const response = await post(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    // Never echo headers or the key; the body is the provider's error message.
    throw new Error(`LLM HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    raw: json.choices?.[0]?.message?.content ?? "",
    usage: json.usage ? { prompt_tokens: json.usage.prompt_tokens, completion_tokens: json.usage.completion_tokens } : null,
  };
}

async function callAnthropic(decision: Decision, cfg: LlmConfig): Promise<RawCompletion> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Action: ${decision.action}\nNote: ${decision.rationale}` }],
  };
  if (cfg.sendTemperature) body.temperature = 0;
  const response = await post(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": cfg.apiKey ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  return {
    raw: (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
    usage: json.usage ? { prompt_tokens: json.usage.input_tokens, completion_tokens: json.usage.output_tokens } : null,
  };
}

/** Providers without a JSON mode sometimes wrap JSON in a ``` fence. Strip only that; the schema still decides. */
function stripFence(raw: string): string {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1]! : raw;
}

export type ExtractionResult = {
  decisionId: string;
  model: string;
  ok: boolean;
  claims: Claim[];
  rejectedOutput: { raw: string; error: string } | null;
  rejectedClaims: Array<{ claim: ExtractedClaim; error: string }>;
  latencyMs: number;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
};

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function extractClaims(decision: Decision, cfg: LlmConfig): Promise<ExtractionResult> {
  const started = performance.now();
  const { raw: rawText, usage } = cfg.protocol === "anthropic" ? await callAnthropic(decision, cfg) : await callOpenAiCompatible(decision, cfg);
  const latencyMs = performance.now() - started;
  const raw = rawText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch (error) {
    return { decisionId: decision.id, model: cfg.model, ok: false, claims: [], rejectedOutput: { raw, error: `invalid JSON: ${(error as Error).message}` }, rejectedClaims: [], latencyMs, usage };
  }
  const validated = ExtractionOutputSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      decisionId: decision.id,
      model: cfg.model,
      ok: false,
      claims: [],
      rejectedOutput: { raw, error: validated.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      rejectedClaims: [],
      latencyMs,
      usage,
    };
  }

  // Grounding check: the quote must literally appear in the note.
  const note = norm(decision.rationale);
  const claims: Claim[] = [];
  const rejectedClaims: ExtractionResult["rejectedClaims"] = [];
  validated.data.claims.forEach((claim, i) => {
    if (!note.includes(norm(claim.quote))) {
      rejectedClaims.push({ claim, error: "quote not found in decision text" });
      return;
    }
    claims.push({ ...claim, id: `${decision.id}:m${i + 1}`, source: "llm" } as Claim);
  });
  return { decisionId: decision.id, model: cfg.model, ok: true, claims, rejectedOutput: null, rejectedClaims, latencyMs, usage };
}
