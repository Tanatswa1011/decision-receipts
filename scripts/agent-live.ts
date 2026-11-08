/**
 * npm run agent:live  [-- --provider=openai --model=gpt-4.1-mini --limit=6]
 * The built-in procurement agent decides data/requests.json in real time and sends
 * telemetry to /api/events. Needs an LLM key (Settings or .env/.env.local) and the app running.
 */
import { loadRequests, runAgentOnRequest } from "@/lib/agent/procurement-agent";
import { makeEmitter } from "@/lib/live/emit";
import { llmConfigFromEnv } from "@/lib/receipts/llm";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

async function main() {
  const cfg = llmConfigFromEnv({ provider: arg("provider"), model: arg("model") });
  const emitter = makeEmitter();
  const requests = loadRequests().slice(0, arg("limit") ? Number(arg("limit")) : undefined);
  console.log(`Built-in agent: ${cfg.providerLabel} / ${cfg.model}, ${requests.length} requests`);
  let input = 0, output = 0;
  for (const req of requests) {
    const r = await runAgentOnRequest(req, cfg, emitter);
    input += r.tokens.input; output += r.tokens.output;
    console.log(`${req.po_id}: ${r.decision ?? "no decision"} · receipt ${r.receipt?.status ?? "-"}${r.receipt?.eur_at_risk ? ` €${r.receipt.eur_at_risk}` : ""} · ${r.tool_calls} tool calls · ${(r.model_ms / 1000).toFixed(1)} s model · ${r.tokens.input + r.tokens.output} tokens${r.error ? ` · ERROR ${r.error}` : ""}`);
  }
  console.log(`Total tokens: ${input} in / ${output} out`);
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
