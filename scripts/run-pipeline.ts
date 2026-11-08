/**
 * CLI wrapper.
 *   npm run run:offline                       AI off: tool-call claims only, code verdicts
 *   npm run run:llm                           AI on, provider = whichever key is in .env / .env.local
 *   npm run run:llm -- --provider=anthropic --model=claude-haiku-5-5
 * The same run can be started from the app: Settings -> Run AI extraction.
 */
import { runPipeline } from "@/lib/receipts/run";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

runPipeline({
  mode: arg("mode") === "llm" ? "llm" : "offline",
  provider: arg("provider"),
  model: arg("model"),
  concurrency: arg("concurrency") ? Number(arg("concurrency")) : undefined,
  log: (m) => console.log(m),
})
  .then(({ file, summary }) => {
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Wrote runs/${file}`);
  })
  .catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
