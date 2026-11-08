"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { generateKey, resetLiveData, runAgent, runReplay, type SourceState } from "@/app/settings/sources-actions";

type Status = {
  events: number;
  runs: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  last_event_at: string | null;
  recent_rejections: Array<{ at: string; status: number; code?: string; reason?: string; event_id: string | null }>;
  job: { kind: string; running: boolean; done: number; total: number; error: string | null; summary: string | null } | null;
};

function Btn({ children, pending, secondary, disabled }: { children: React.ReactNode; pending: string; secondary?: boolean; disabled?: boolean }) {
  const { pending: p } = useFormStatus();
  return <button type="submit" className={secondary ? "secondary" : ""} disabled={p || disabled}>{p ? pending : children}</button>;
}

function Note({ s }: { s: SourceState }) {
  if (!s) return null;
  return <p className={`notice ${s.ok ? "ok" : "bad"}`} role="status">{s.message}</p>;
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="secondary" onClick={() => { navigator.clipboard?.writeText(text).then(() => setDone(true)).catch(() => undefined); }}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function SourcesPanel({ endpoint, maskedKey, hasLlm }: { endpoint: string; maskedKey: string | null; hasLlm: boolean }) {
  const [keyState, keyAction] = useActionState(generateKey, null);
  const [replayState, replayAction] = useActionState(runReplay, null);
  const [agentState, agentAction] = useActionState(runAgent, null);
  const [resetState, resetAction] = useActionState(resetLiveData, null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => fetch("/api/live/status", { cache: "no-store" }).then((r) => r.json()).then((s) => alive && setStatus(s)).catch(() => undefined);
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const job = status?.job;
  const busy = Boolean(job?.running);
  const hasKey = Boolean(maskedKey || keyState?.key);

  return (
    <div className="card steps">
      <div>
        <b>Ingest endpoint</b>
        <div className="hint">Any agent posts ACPT-format telemetry here. See docs/CONNECT_YOUR_AGENT.md.</div>
        <div className="kvrow"><code>POST {endpoint}</code><Copy text={endpoint} /></div>
        <div className="kvrow">
          <span>Key: <span className="mono">{keyState?.key ?? maskedKey ?? "none yet"}</span></span>
          {keyState?.key ? <Copy text={keyState.key} /> : null}
          <form action={keyAction}><Btn secondary pending="Generating…">{hasKey ? "Rotate key" : "Generate key"}</Btn></form>
        </div>
        <Note s={keyState} />
      </div>

      <div className="srcstats">
        <span><span className={status && status.events ? "live-dot" : ""} />{status?.runs ?? 0} runs · {status?.events ?? 0} events</span>
        <span className="ok-text">{status?.accepted ?? 0} accepted</span>
        <span>{status?.duplicate ?? 0} duplicates</span>
        <span className={status?.rejected ? "bad-text" : ""}>{status?.rejected ?? 0} rejected</span>
        <span className="muted">last event {status?.last_event_at ? new Date(status.last_event_at).toLocaleTimeString() : "never"}</span>
      </div>
      {status?.recent_rejections.length ? (
        <details>
          <summary className="small">Recent rejections</summary>
          <ul className="small">
            {status.recent_rejections.map((r, i) => <li key={i}><span className="mono">{r.status}</span> {r.code}: {r.reason}</li>)}
          </ul>
        </details>
      ) : null}

      <form action={replayAction}>
        <div className="step">
          <div><b>Replay the 60 synthetic decisions</b><div className="hint">Free and repeatable, no LLM key needed. Same receipts as the file, now arriving as telemetry.</div></div>
          <Btn disabled={!hasKey || busy} pending="Starting…">Start replay</Btn>
        </div>
        <Note s={replayState} />
      </form>

      <form action={agentAction}>
        <div className="step">
          <div>
            <b>Run the built-in agent on 6 pending requests</b>
            <div className="hint">A real tool-calling agent on your Settings model. Its supplier lookup reads a stale cache (15 Jan 2026), a deliberately injected failure.</div>
          </div>
          <Btn disabled={!hasKey || !hasLlm || busy} pending="Starting…">Run agent</Btn>
        </div>
        {!hasLlm ? <p className="hint">Needs a model key (section 1).</p> : null}
        <Note s={agentState} />
      </form>

      {job ? (
        <div className={`notice ${job.error ? "bad" : job.running ? "" : "ok"}`}>
          {job.running ? <><span className="live-dot" />{job.kind === "replay" ? "Replaying" : "Agent deciding"}: {job.done}/{job.total}</> : job.error ? `${job.kind} failed: ${job.error}` : `${job.kind} done: ${job.summary}`}
          {job.running ? <div className="meter"><span style={{ width: `${(job.done / Math.max(1, job.total)) * 100}%` }} /></div> : null}
        </div>
      ) : null}

      <form action={resetAction}>
        <div className="step">
          <div><b>Reset live data</b><div className="hint">Deletes runs/live/ only.</div></div>
          <Btn secondary disabled={busy} pending="Clearing…">Reset</Btn>
        </div>
        <Note s={resetState} />
      </form>
    </div>
  );
}
