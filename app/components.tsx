import Link from "next/link";
import { llmRunFiles, type RunView } from "@/lib/receipts/runs";
import type { Verdict } from "@/lib/receipts/claims";
import type { ReceiptStatus } from "@/lib/receipts/pipeline";
import { setSource } from "@/app/source-actions";

export function withAi(href: string, ai: string): string {
  if (ai === "off") return href;
  return `${href}${href.includes("?") ? "&" : "?"}ai=${encodeURIComponent(ai)}`;
}

const NAV = [
  { href: "/", label: "Decisions" },
  { href: "/queue", label: "Review queue" },
  { href: "/metrics", label: "Results" },
  { href: "/settings", label: "Settings" },
];

export function Header({ run, path }: { run: RunView; path: string }) {
  const files = llmRunFiles();
  const section = NAV.find((n) => n.href !== "/" && path.startsWith(n.href))?.href ?? "/";
  return (
    <header className="top">
      <div className="top-inner">
        <Link href={withAi("/", run.key)} className="brand">
          <span className="logo" aria-hidden>▤</span>
          <span>
            Decision Receipts
            <small>Kesselfeld Antriebstechnik GmbH · synthetic data</small>
          </span>
        </Link>
        <nav aria-label="Sections">
          {NAV.map((n) => (
            <Link key={n.href} href={withAi(n.href, run.key)} className={section === n.href ? "on" : ""} aria-current={section === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <form action={setSource} className="seg" role="group" aria-label="Decision log source">
          <button type="submit" name="source" value="file" className={run.source === "file" ? "on" : ""} title="The labelled synthetic log (data/decisions.json)">File</button>
          <button type="submit" name="source" value="live" className={run.source === "live" ? "on" : ""} title="Decisions that arrived as telemetry on POST /api/events">Live</button>
        </form>
        <div className="seg" role="group" aria-label="Claim extraction model">
          <Link href={path} className={run.key === "off" ? "on" : ""} title="Code only: structured fields from the agent's tool call">AI off</Link>
          {files.length === 0 ? (
            <Link href="/settings" className="ghost" title="Add a key in Settings to run AI extraction">AI on +</Link>
          ) : (
            files.map((f) => (
              <Link key={f} href={`${path}?ai=${encodeURIComponent(f)}`} className={run.key === f ? "on" : ""} title={`AI on: ${f}`}>
                {f.replace(/^llm-|\.json$/g, "").replace(/^[a-z]+-/, "")}
              </Link>
            ))
          )}
        </div>
      </div>
    </header>
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: "bad" | "ok" | "muted"; hint?: React.ReactNode }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

const STATUS_TEXT: Record<ReceiptStatus, string> = { flagged: "Flagged", verified: "Verified", unverifiable: "Unchecked" };
export function StatusPill({ status }: { status: ReceiptStatus }) {
  return <span className={`pill s-${status}`}>{status === "flagged" ? "⚠ " : status === "verified" ? "✓ " : "○ "}{STATUS_TEXT[status]}</span>;
}

const VERDICT_TEXT: Record<Verdict, string> = { verified: "Verified", contradicted: "Contradicted", unsupported: "Unsupported", out_of_scope: "Not checkable" };
const VERDICT_ICON: Record<Verdict, string> = { verified: "✓", contradicted: "✕", unsupported: "?", out_of_scope: "–" };
export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return <span className={`pill v-${verdict}`}>{VERDICT_ICON[verdict]} {VERDICT_TEXT[verdict]}</span>;
}
export function VerdictIcon({ verdict }: { verdict: Verdict }) {
  return <span className={`vicon v-${verdict}`} aria-label={VERDICT_TEXT[verdict]}>{VERDICT_ICON[verdict]}</span>;
}

export function AgentLog({ status }: { status: string }) {
  return <span className="agentlog" title="What the agent's own log reports">✓ {status}</span>;
}

const SRC = { replay: "replay", live_agent: "built-in agent", external: "external" } as const;
export function SourceBadge({ source }: { source?: keyof typeof SRC }) {
  return source ? <span className="srcbadge">{SRC[source]}</span> : null;
}

export function actionLabel(action: string): string {
  return action === "approve_po" ? "Approve PO" : action === "reject_po" ? "Reject PO" : "Release payment";
}
