import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Header, Stat } from "@/app/components";
import { loadRun } from "@/lib/receipts/runs";

export const dynamic = "force-dynamic";

const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const runName = (r: any) => (r.mode === "llm" ? `AI on · ${r.model}` : "AI off · code only");

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai } = await searchParams;
  const run = loadRun(ai);
  const path = join(process.cwd(), "runs", "metrics.json");
  const m = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const current = m?.results.find((r: any) => r.file === (run.key === "off" ? "offline.json" : run.key)) ?? m?.results[0];

  return (
    <>
      <Header run={run} path="/metrics" />
      <main>
        <div className="page-head">
          <div>
            <h1>Results</h1>
            <p className="lede">
              Measured on the labelled synthetic set by <code>npm run eval</code>, not estimated.
              {m ? ` N = ${m.baseline.labelled} decisions, ${m.baseline.bad} deliberately bad. Last run ${m.generated_at.slice(0, 16).replace("T", " ")} UTC.` : ""}
            </p>
          </div>
        </div>
        {!m ? (
          <p className="empty">No results yet. Run <code>npm run run:offline</code> and <code>npm run eval</code>.</p>
        ) : (
          <>
            <h2 style={{ marginBottom: 10 }}>{runName(current)}</h2>
            <div className="stats">
              <Stat label="Precision" value={pct(current.precision)} hint={`${current.tp} of ${current.flagged} flags were truly bad`} />
              <Stat label="Recall" value={pct(current.recall)} tone={current.recall < 1 ? undefined : "ok"} hint={`${current.tp} of ${current.tp + current.fn} bad decisions caught`} />
              <Stat label="Verdicts set by code" value={`${current.verdicts_by_code}/${current.verdicts_total}`} tone="ok" hint="a model never sets a verdict" />
              <Stat
                label="Cost per decision"
                value={current.eur_per_decision != null ? `€${current.eur_per_decision.toFixed(4)}` : current.usd_per_decision != null ? `$${current.usd_per_decision.toFixed(4)}` : current.mode === "llm" ? "price not set" : "€0"}
                hint={current.llm_latency_ms ? `${(current.llm_latency_ms.p50 / 1000).toFixed(2)} s median model latency` : `${current.verify_ms_per_decision.toFixed(2)} ms of code per decision`}
              />
            </div>

            <h2 style={{ margin: "22px 0 10px" }}>All runs</h2>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr><th>Run</th><th className="num">Precision</th><th className="num">Recall</th><th className="num">TP / FP / FN</th><th className="num">Bad in first {m.baseline.k}</th><th className="num">Rejected outputs / claims</th><th className="num">Extraction recall</th><th className="num">Cost / decision</th><th className="num">Latency</th></tr>
                </thead>
                <tbody>
                  {m.results.map((r: any) => (
                    <tr key={r.file}>
                      <td><b>{runName(r)}</b></td>
                      <td className="num">{pct(r.precision)}</td>
                      <td className="num">{pct(r.recall)}</td>
                      <td className="num">{r.tp} / {r.fp} / {r.fn}</td>
                      <td className="num">{r.queue_first10_bad} of {m.baseline.bad}</td>
                      <td className="num">{r.rejected_model_outputs} / {r.rejected_model_claims}</td>
                      <td className="num">{r.extraction ? pct(r.extraction.recall) : "–"}</td>
                      <td className="num">{r.eur_per_decision != null ? `€${r.eur_per_decision.toFixed(5)}` : r.usd_per_decision != null ? `$${r.usd_per_decision.toFixed(5)}` : r.mode === "llm" ? "price not set" : "€0"}</td>
                      <td className="num">{r.llm_latency_ms ? `${(r.llm_latency_ms.p50 / 1000).toFixed(2)} s` : `${r.verify_ms_per_decision.toFixed(2)} ms`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.results.every((r: any) => r.mode !== "llm") ? (
              <p className="muted small" style={{ marginTop: 10 }}>No AI-on run yet. <Link href="/settings">Add a key in Settings</Link> to compare models.</p>
            ) : null}

            <h2 style={{ margin: "22px 0 10px" }}>By defect type ({runName(current)})</h2>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Defect</th><th className="num">Caught</th><th className="num">Planted</th></tr></thead>
                <tbody>
                  {Object.entries(current.by_defect as Record<string, { planted: number; caught: number }>).map(([k, v]) => (
                    <tr key={k} className={v.caught < v.planted ? "row-flag" : ""}>
                      <td>{k.replace(/_/g, " ")}</td>
                      <td className="num">{v.caught}</td>
                      <td className="num">{v.planted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              Missed: {current.missed_receipts.length ? current.missed_receipts.map((n: number) => `#${n}`).join(", ") : "none"} · False flags: {current.false_flag_receipts.length ? current.false_flag_receipts.map((n: number) => `#${n}`).join(", ") : "none"}
            </p>
          </>
        )}

        {run.rejected.length ? (
          <>
            <h2 style={{ margin: "22px 0 10px" }}>Rejected model outputs ({run.label})</h2>
            {run.rejected.map((x) => (
              <details key={x.decision_id} className="card">
                <summary className="mono small">{x.decision_id}: {x.error}</summary>
                <pre>{x.raw || "(empty)"}</pre>
              </details>
            ))}
          </>
        ) : null}
      </main>
    </>
  );
}
