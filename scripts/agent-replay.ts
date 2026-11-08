/**
 * npm run agent:replay  [-- --delay=250 --limit=60]
 * Streams the 60 synthetic decisions to /api/events as telemetry. The app must be running.
 */
import { replayDecisions } from "@/lib/live/replay";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

replayDecisions({ delayMs: Number(arg("delay") ?? 0), limit: arg("limit") ? Number(arg("limit")) : undefined, onProgress: (d, t) => process.stdout.write(`\r${d}/${t}`) })
  .then((r) => {
    const lat = [...r.receipt_latency_ms].sort((a, b) => a - b);
    const p = (q: number) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
    console.log(`\n${r.runs} runs · ${r.accepted} events accepted · ${r.duplicates} duplicates · ${r.flagged} flagged`);
    if (lat.length) console.log(`ingest -> receipt latency (run.completed round trip): p50 ${p(0.5)!.toFixed(1)} ms · p95 ${p(0.95)!.toFixed(1)} ms · max ${lat.at(-1)!.toFixed(1)} ms (n=${lat.length})`);
  })
  .catch((e) => { console.error((e as Error).message); process.exit(1); });
