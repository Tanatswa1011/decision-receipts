/**
 * npm run demo:prep  [-- --with-agent]
 * Puts the live feed in a known state for rehearsal/recording: clears runs/live/, replays
 * the 60 synthetic decisions, and (with --with-agent, about $0.007 on your key) re-runs the
 * built-in agent on the 6 pending requests. The app must be running (npm run dev).
 */
import { loadRequests, runAgentOnRequest } from "@/lib/agent/procurement-agent";
import { makeEmitter } from "@/lib/live/emit";
import { replayDecisions } from "@/lib/live/replay";
import { resetLive } from "@/lib/live/store";
import { llmConfigFromEnv } from "@/lib/receipts/llm";

async function main() {
  const res = await fetch("http://127.0.0.1:3100/api/live/status").catch(() => null);
  if (!res?.ok) throw new Error("The app is not running. Start it first: npm run dev");
  resetLive();
  const r = await replayDecisions({});
  console.log(`Replay: ${r.runs} runs, ${r.flagged} flagged.`);
  if (process.argv.includes("--with-agent")) {
    const cfg = llmConfigFromEnv();
    const emitter = makeEmitter();
    for (const req of loadRequests()) {
      const a = await runAgentOnRequest(req, cfg, emitter);
      console.log(`Agent ${req.po_id}: ${a.decision ?? "no decision"} → receipt ${a.receipt?.status ?? "-"}${a.error ? ` (${a.error})` : ""}`);
    }
  } else {
    console.log("Built-in agent runs not included (add --with-agent, about $0.007).");
  }
  console.log("Ready: open http://127.0.0.1:3100, header → Live.");
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
