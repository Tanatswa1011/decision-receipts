import { getSource } from "@/app/source";
import Link from "next/link";
import { Header, StatusPill, withAi } from "@/app/components";
import { findEvidence, loadDecisions, loadSystems } from "@/lib/receipts/data";
import { loadRun } from "@/lib/receipts/runs";

export const dynamic = "force-dynamic";

function Field({ k, v }: { k: string; v: unknown }) {
  const text = v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <tr><td className="muted mono small">{k}</td><td className="mono">{text}</td></tr>
  );
}

export default async function EvidencePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ai?: string }> }) {
  const { id: raw } = await params;
  const { ai } = await searchParams;
  const id = decodeURIComponent(raw);
  const run = loadRun(ai, await getSource());
  const hit = findEvidence(loadSystems(), loadDecisions(), id);
  const citing = run.receipts.filter((r) => r.claims.some((c) => c.evidence_ids.includes(id)));
  const record = (hit?.record ?? {}) as Record<string, unknown>;
  const flat = Object.entries(record).filter(([k]) => k !== "passages");
  if (record.iso_9001 && typeof record.iso_9001 === "object") {
    flat.splice(flat.findIndex(([k]) => k === "iso_9001"), 1, ...Object.entries(record.iso_9001 as object).map(([k, v]) => [`iso_9001.${k}`, v] as [string, unknown]));
  }

  return (
    <>
      <Header run={run} path={`/evidence/${raw}`} />
      <main className="narrow" style={{ maxWidth: 820 }}>
        <div className="crumbs"><Link href={withAi("/", run.key)}>← All decisions</Link></div>
        <div className="vb-kicker">Evidence · {hit?.system ?? "no system of record"}</div>
        <h1 className="mono">{id}</h1>
        {!hit ? (
          <p className="notice bad">No record with this ID exists in any system of record.</p>
        ) : (
          <>
            {hit.passage ? (
              <div className="card">
                <div className="vb-kicker">Cited passage {hit.passage.id}</div>
                <p className="note" style={{ margin: 0 }}>{hit.passage.text}</p>
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="grid"><tbody>{flat.map(([k, v]) => <Field key={k} k={k} v={v} />)}</tbody></table>
            </div>
            {Array.isArray(record.passages) ? (
              <details className="card" style={{ marginTop: 16 }}>
                <summary>All passages ({(record.passages as unknown[]).length})</summary>
                {(record.passages as Array<{ id: string; text: string }>).map((p) => (
                  <p key={p.id} className="small"><span className="mono muted">{p.id}</span> {p.text}</p>
                ))}
              </details>
            ) : null}
          </>
        )}
        {citing.length ? (
          <>
            <h2 style={{ margin: "22px 0 10px" }}>Receipts citing this record</h2>
            <div className="tabs">
              {citing.map((r) => (
                <Link key={r.decision.id} href={withAi(`/receipt/${r.decision.receipt_no}`, run.key)}>
                  #{r.decision.receipt_no} <StatusPill status={r.status} />
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}
