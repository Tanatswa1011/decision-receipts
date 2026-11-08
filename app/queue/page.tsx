import { getSource } from "@/app/source";
import Link from "next/link";
import { Header, Stat, StatusPill, actionLabel, withAi } from "@/app/components";
import { headline, topFinding } from "@/lib/receipts/describe";
import { loadSystems } from "@/lib/receipts/data";
import { loadRun, queueFor, eur, baselineMetrics, receiptRefs } from "@/lib/receipts/runs";

export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai } = await searchParams;
  const run = loadRun(ai, await getSource());
  const db = loadSystems();
  const queue = queueFor(run);
  const base = baselineMetrics();
  const m = run.metrics;
  const max = Math.max(1, ...queue.map((r) => r.eur_at_risk));
  const k = base?.k ?? 10;

  return (
    <>
      <Header run={run} path="/queue" />
      <main>
        <div className="page-head">
          <div>
            <h1>Review queue</h1>
            <p className="lede">Review the decisions with the most money at risk first: flagged receipts by € at risk, then decisions nobody could check, then verified ones.</p>
          </div>
        </div>

        {m && base ? (
          <div className="compare">
            <Stat
              label={`This queue, first ${k} reviews`}
              tone="bad"
              value={<>{m.queue_first10_bad} <span className="muted small">of {base.bad} bad found</span></>}
              hint={<div className="meter"><span style={{ width: `${(m.queue_first10_bad / base.bad) * 100}%` }} /></div>}
            />
            <Stat
              label={`Random spot checks, ${k} reviews`}
              value={<>{base.random.mean.toFixed(1)} <span className="muted small">of {base.bad} on average</span></>}
              hint={<div className="meter"><span style={{ width: `${(base.random.mean / base.bad) * 100}%` }} /></div>}
            />
            <Stat
              label={`${k} largest orders, unverified`}
              value={<>{base.amount_only_first10_bad} <span className="muted small">of {base.bad}</span></>}
              hint={<div className="meter"><span style={{ width: `${(base.amount_only_first10_bad / base.bad) * 100}%` }} /></div>}
            />
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th className="num">Rank</th><th>Receipt</th><th>Supplier</th><th>Status</th><th className="num">€ at risk</th><th></th><th>Finding</th></tr>
            </thead>
            <tbody>
              {queue.map((r, i) => {
                const date = r.decision.timestamp.slice(0, 10);
                const top = topFinding(r.claims, date);
                const { supplier } = receiptRefs(r, db);
                return (
                  <tr key={r.decision.id} className={`clickable ${i === k - 1 ? "cutoff" : ""} ${r.status === "flagged" ? "row-flag" : ""}`}>
                    <td className="num muted">{i + 1}</td>
                    <td className="nowrap">
                      <Link href={withAi(`/receipt/${r.decision.receipt_no}`, run.key)} className="rowlink">#{r.decision.receipt_no}</Link>{" "}
                      <span className="muted small">{actionLabel(r.decision.action)}</span>
                    </td>
                    <td>{supplier?.name ?? <span className="muted">unknown</span>}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="num">{r.status === "flagged" ? <b className="bad-text">{eur(r.eur_at_risk)}</b> : <span className="muted">–</span>}</td>
                    <td>{r.status === "flagged" ? <div className="bar-wrap"><div className="bar" style={{ width: `${(r.eur_at_risk / max) * 100}%` }} /></div> : null}</td>
                    <td className="finding">
                      {top ? headline(top, date) : r.status === "unverifiable" ? <span className="muted">No structured facts to check</span> : <span className="muted">All facts verified</span>}
                      {i === k - 1 ? <div className="cutoff-label">↑ first {k} reviews</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
