import { getSource } from "@/app/source";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentLog, Header, StatusPill, VerdictIcon, VerdictPill, actionLabel, withAi } from "@/app/components";
import type { ClaimResult, Verdict } from "@/lib/receipts/claims";
import type { Decision } from "@/lib/receipts/data";
import { liveRuns } from "@/lib/live/adapter";
import { describeClaim, headline, sourceLabel, topFinding } from "@/lib/receipts/describe";
import { loadSystems } from "@/lib/receipts/data";
import { loadRun, eur, receiptRefs } from "@/lib/receipts/runs";

export const dynamic = "force-dynamic";

const ORDER: Record<Verdict, number> = { contradicted: 0, unsupported: 1, verified: 2, out_of_scope: 3 };
const ID_RE = /(PO-\d{4}|SUP-\d{3}|CTR-\d{4}-\d{3}|CC-\d{3}|QC-\d{5})/g;

/** Colour each record ID in the agent's note by the worst verdict of the facts that cite it. */
function highlight(text: string, claims: ClaimResult[], certToSupplier: Map<string, string>) {
  const worst = (id: string): Verdict | null => {
    const ref = certToSupplier.get(id) ?? id;
    const hits = claims.filter((c) => c.source !== "policy" && Object.values(c.params).some((v) => String(v) === ref) && (!id.startsWith("QC-") || c.type === "supplier_iso_certified"));
    if (!hits.length) return null;
    return hits.map((c) => c.verdict).sort((a, b) => ORDER[a] - ORDER[b])[0]!;
  };
  return text.split(ID_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const v = worst(part);
    return <mark key={i} className={v ? `hl v-${v}` : "hl"}>{part}</mark>;
  });
}

/** What the agent's own lookup step returned for the record this fact is about (live telemetry only). */
function agentSaw(c: ClaimResult, d: Decision): string | null {
  const saw = d.live?.agent_saw;
  if (!saw) return null;
  const p = c.params as Record<string, unknown>;
  const ref = String(c.type.startsWith("contract") ? p.contract_id : c.type === "budget_available" ? p.cost_center : c.type === "supplier_iso_certified" ? p.supplier_id : p.po_id ?? "");
  const hit = saw[ref];
  if (!hit) return null;
  const text = Object.entries(hit).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function FactRow({ c, date, aiKey, d }: { c: ClaimResult; date: string; aiKey: string; d: Decision }) {
  const t = describeClaim(c, date);
  const saw = agentSaw(c, d);
  return (
    <li className={`fact f-${c.verdict}`}>
      <VerdictIcon verdict={c.verdict} />
      <div className="fact-body">
        <div className="fact-title">
          <b>{t.title}</b> <span className="src">{sourceLabel(c.source)}</span>
        </div>
        <div className="fact-cmp">
          <div><span className="k">{c.source === "policy" ? "Policy requires" : "Agent said"}</span> {t.claim}</div>
          <div><span className="k">Record says</span> {t.record}</div>
          {saw ? <div className="saw"><span className="k">Agent saw (its own lookup step, not used for the verdict)</span> <span className="mono small">{saw}</span></div> : null}
        </div>
        {c.verdict === "contradicted" || c.verdict === "unsupported" ? <div className="fact-msg">{c.message}</div> : null}
      </div>
      <div className="fact-side">
        <VerdictPill verdict={c.verdict} />
        <div className="evidence">
          {c.evidence_ids.length === 0 ? (
            <span className="muted small">{c.verdict === "out_of_scope" ? "no source needed" : "no record exists"}</span>
          ) : (
            c.evidence_ids.slice(0, 3).map((id) => (
              <Link key={id} href={withAi(`/evidence/${encodeURIComponent(id)}`, aiKey)} className="chip">{id}</Link>
            ))
          )}
        </div>
      </div>
    </li>
  );
}

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ ai?: string }> }) {
  const { no } = await params;
  const { ai } = await searchParams;
  const run = loadRun(ai, await getSource());
  const db = loadSystems();
  const r = run.receipts.find((x) => x.decision.receipt_no === Number(no));
  if (!r) notFound();
  const d = r.decision;
  const date = d.timestamp.slice(0, 10);
  const { supplier, po } = receiptRefs(r, db);
  const sorted = [...r.claims].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const problems = sorted.filter((c) => c.verdict === "contradicted" || c.verdict === "unsupported");
  const rest = sorted.filter((c) => !problems.includes(c));
  const top = topFinding(r.claims, date);
  const certToSupplier = new Map([...db.suppliers.values()].filter((s) => s.iso_9001).map((s) => [s.iso_9001!.cert_id, s.id]));
  const idx = run.receipts.indexOf(r);
  const prev = run.receipts[idx - 1];
  const next = run.receipts[idx + 1];

  return (
    <>
      <Header run={run} path={`/receipt/${no}`} />
      <main className="receipt">
        <div className="crumbs">
          <Link href={withAi("/", run.key)}>← All decisions</Link>
          <span className="pager">
            {prev ? <Link href={withAi(`/receipt/${prev.decision.receipt_no}`, run.key)}>‹ #{prev.decision.receipt_no}</Link> : null}
            {next ? <Link href={withAi(`/receipt/${next.decision.receipt_no}`, run.key)}>#{next.decision.receipt_no} ›</Link> : null}
          </span>
        </div>

        <section className={`verdict-banner b-${r.status}`}>
          <div className="vb-main">
            <div className="vb-kicker">Receipt #{d.receipt_no} · {actionLabel(d.action)} · {supplier?.name ?? "supplier unknown"}</div>
            <h1>
              {r.status === "flagged"
                ? `${problems.length} of ${r.counts.verified + r.counts.contradicted + r.counts.unsupported} facts failed`
                : r.status === "verified"
                  ? `All ${r.counts.verified} facts verified`
                  : "Nothing here could be checked"}
            </h1>
            <p className="vb-sub">
              {top
                ? headline(top, date)
                : r.status === "unverifiable"
                  ? run.key === "off"
                    ? "This agent writes free text only. With AI off, there are no structured facts to check. Turn AI on to split the note into checkable facts."
                    : "No checkable facts were found in the note."
                  : "Every fact the agent relied on matches its system of record."}
            </p>
            <div className="vb-compare">
              <span>Agent log: <AgentLog status={d.agent_log_status} /></span>
              <span>Receipt: <StatusPill status={r.status} /></span>
            </div>
          </div>
          <div className="vb-side">
            <div className="stat-label">€ at risk</div>
            <div className={`vb-amount ${r.eur_at_risk > 0 ? "bad-text" : ""}`}>{eur(r.eur_at_risk)}</div>
            <div className="muted small">{r.status === "flagged" ? r.risk_basis : po ? `order value ${eur(po.amount_eur)}` : ""}</div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>What the agent wrote</h2>
            <span className="muted small">{d.agent} · {d.timestamp.slice(0, 16).replace("T", " ")}</span>
          </div>
          <p className="note">{highlight(d.rationale, r.claims, certToSupplier)}</p>
          <div className="legend small">
            <mark className="hl v-verified">ID</mark> verified <mark className="hl v-contradicted">ID</mark> contradicted <mark className="hl v-unsupported">ID</mark> no source
          </div>
          {d.tool_call ? (
            <details>
              <summary className="small">Structured tool-call payload</summary>
              <pre>{JSON.stringify(d.tool_call, null, 2)}</pre>
            </details>
          ) : (
            <p className="muted small">Legacy agent: free text only, no tool-call payload.</p>
          )}
        </section>

        <section>
          <div className="section-head">
            <h2>Facts this decision relied on</h2>
            <span className="muted small">Verdicts set by code against the system of record{run.key === "off" ? "" : " · the model only split the note into facts"}</span>
          </div>
          {problems.length ? <ul className="facts">{problems.map((c) => <FactRow key={c.id} c={c} date={date} aiKey={run.key} d={d} />)}</ul> : null}
          {rest.length ? (
            problems.length ? (
              <details className="more">
                <summary>{rest.length} more facts ({r.counts.verified} verified{r.counts.out_of_scope ? `, ${r.counts.out_of_scope} not checkable` : ""})</summary>
                <ul className="facts">{rest.map((c) => <FactRow key={c.id} c={c} date={date} aiKey={run.key} d={d} />)}</ul>
              </details>
            ) : (
              <ul className="facts">{rest.map((c) => <FactRow key={c.id} c={c} date={date} aiKey={run.key} d={d} />)}</ul>
            )
          ) : null}
          {r.claims.length === 0 ? <p className="empty">No facts extracted.</p> : null}
        </section>

        {d.live ? <RunTimeline runId={d.live.run_id} source={d.live.source} /> : null}
      </main>
    </>
  );
}

const SOURCE_NAME = { replay: "Replay script", live_agent: "Built-in agent", external: "External agent" } as const;

function RunTimeline({ runId, source }: { runId: string; source: keyof typeof SOURCE_NAME }) {
  const run = liveRuns().find((r) => r.run_id === runId);
  if (!run) return null;
  const t0 = Date.parse(run.events[0]!.received_at);
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>Run timeline</h2>
        <span className="muted small">{SOURCE_NAME[source]} · run <span className="mono">{runId}</span> · {run.events.length} telemetry events via POST /api/events</span>
      </div>
      <ol className="timeline">
        {run.events.map((e) => (
          <li key={e.event.event_id} className={`tl-${e.event.event_type.replace(/\./g, "-")}`}>
            <span className="tl-dot" aria-hidden />
            <span className="mono small tl-type">{e.event.event_type}</span>
            <span>{e.event.action ? <b>{e.event.action}</b> : null} {e.event.resource_id ? <span className="mono small muted">{e.event.resource_id}</span> : null}</span>
            <span className="muted small tl-time">+{Date.parse(e.received_at) - t0} ms</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
