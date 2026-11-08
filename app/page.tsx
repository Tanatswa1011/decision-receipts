import { getSource } from "@/app/source";
import Link from "next/link";
import { AgentLog, Header, SourceBadge, Stat, StatusPill, actionLabel, withAi } from "@/app/components";
import { LiveRefresher } from "@/app/LiveRefresher";
import { liveRuns } from "@/lib/live/adapter";
import { loadRun, eur, receiptRefs } from "@/lib/receipts/runs";
import { loadSystems } from "@/lib/receipts/data";
import type { ReceiptStatus } from "@/lib/receipts/pipeline";
import { headline, topFinding } from "@/lib/receipts/describe";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: "all" | ReceiptStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Flagged" },
  { key: "unverifiable", label: "Unchecked" },
  { key: "verified", label: "Verified" },
];

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ ai?: string; f?: string }> }) {
  const { ai, f } = await searchParams;
  const run = loadRun(ai, await getSource());
  const db = loadSystems();
  const filter = (FILTERS.find((x) => x.key === f)?.key ?? "all") as "all" | ReceiptStatus;
  const count = (s: ReceiptStatus) => run.receipts.filter((r) => r.status === s).length;
  const flagged = run.receipts.filter((r) => r.status === "flagged");
  const atRisk = flagged.reduce((a, r) => a + r.eur_at_risk, 0);
  const rows = filter === "all" ? run.receipts : run.receipts.filter((r) => r.status === filter);
  const live = run.source === "live";
  // Newest first in the live feed, so arrivals appear at the top.
  if (live) rows.reverse();
  const otherRuns = live ? liveRuns().filter((r) => r.state !== "decision").reverse() : [];

  return (
    <>
      <Header run={run} path="/" />
      <main>
        <div className="page-head">
          <div>
            <h1>{live ? "Live decision feed" : "Agent decisions, October 2026"}</h1>
            <p className="lede">
              {live
                ? <>Decisions arriving as telemetry on <code>POST /api/events</code>, verified the moment their run completes. Newest first.</>
                : <>The procurement agent logged every decision as <AgentLog status="success" />. Each receipt checks the facts behind a decision against the ERP, supplier database, budget table and contracts.</>}
            </p>
          </div>
          {live ? <LiveRefresher /> : null}
        </div>

        {live && run.receipts.length === 0 && otherRuns.length === 0 ? (
          <div className="empty">
            <p><b>No live decisions yet.</b></p>
            <p>Start the replay or the built-in agent in <Link href="/settings#sources">Settings → Sources</Link>, or post events from your own agent. This page updates by itself.</p>
          </div>
        ) : null}

        <div className="stats">
          <Stat label="Decisions" value={run.receipts.length} hint={<>all <AgentLog status="success" /> in the agent log</>} />
          <Stat label="Flagged" value={flagged.length} tone="bad" hint="a stated fact is false or has no source" />
          <Stat label="€ at risk" value={eur(atRisk)} tone="bad" hint="committed on flagged decisions" />
          <Stat label="Unchecked" value={count("unverifiable")} tone="muted" hint={run.key === "off" ? "free-text logs: turn AI on to check them" : "nothing checkable found"} />
        </div>

        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Filter by receipt status">
            {FILTERS.map((x) => (
              <Link
                key={x.key}
                role="tab"
                aria-selected={filter === x.key}
                className={filter === x.key ? "on" : ""}
                href={withAi(x.key === "all" ? "/" : `/?f=${x.key}`, run.key)}
              >
                {x.label} <span className="count">{x.key === "all" ? run.receipts.length : count(x.key)}</span>
              </Link>
            ))}
          </div>
          <Link href={withAi("/queue", run.key)} className="btn">Open review queue →</Link>
        </div>

        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>#</th><th>Date</th>{live ? <th>Source</th> : null}<th>Action</th><th>Supplier</th><th className="num">Amount</th><th>Agent log</th><th>Receipt</th><th>Finding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { po, supplier } = receiptRefs(r, db);
                const href = withAi(`/receipt/${r.decision.receipt_no}`, run.key);
                return (
                  <tr key={r.decision.id} className={`clickable ${r.status === "flagged" ? "row-flag" : ""}`}>
                    <td><Link href={href} className="rowlink">#{r.decision.receipt_no}</Link></td>
                    <td className="nowrap">{r.decision.timestamp.slice(5, 10).replace("-", "/")} <span className="muted">{r.decision.timestamp.slice(11, 16)}</span></td>
                    {live ? <td><SourceBadge source={r.decision.live?.source} /></td> : null}
                    <td className="nowrap">{actionLabel(r.decision.action)}</td>
                    <td>{supplier ? supplier.name : <span className="muted">unknown (free text)</span>}</td>
                    <td className="num">{po ? eur(po.amount_eur) : <span className="muted">–</span>}</td>
                    <td><AgentLog status={r.decision.agent_log_status} /></td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="finding">
                      {r.status === "flagged" ? <><b className="bad-text">{eur(r.eur_at_risk)}</b> · {headline(topFinding(r.claims, r.decision.timestamp.slice(0, 10))!, r.decision.timestamp.slice(0, 10))}</> : r.status === "unverifiable" ? <span className="muted">No structured facts to check</span> : <span className="muted">{r.counts.verified} facts verified</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {otherRuns.length ? (
          <>
            <h2 style={{ margin: "22px 0 10px" }}>Runs without a receipt</h2>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Run</th><th>Agent</th><th>State</th><th>Why no receipt</th></tr></thead>
                <tbody>
                  {otherRuns.map((r) => (
                    <tr key={r.run_id}>
                      <td className="mono small">{r.run_id}</td>
                      <td className="small">{r.agent_id}</td>
                      <td><span className={`pill ${r.state === "failed" ? "v-contradicted" : "s-unverifiable"}`}>{r.state.replace("_", " ")}</span></td>
                      <td className="small">
                        {r.state === "in_progress" ? "Waiting for run.completed" : r.state === "failed" ? `A step failed: ${String((r.events.find((e) => e.event.event_type === "workflow.step.failed")?.event.risk_metadata as any)?.error ?? "see run events")}` : `No checks defined for this action${r.unmapped_actions.length ? `: ${r.unmapped_actions.join(", ")}` : ""}. Not verified.`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}
