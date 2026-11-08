import { getSource } from "@/app/source";
import { Header } from "@/app/components";
import { removeKey } from "@/app/settings/actions";
import { RunForms, SettingsForm } from "@/app/settings/SettingsForms";
import { loadRun } from "@/lib/receipts/runs";
import { settingsView } from "@/lib/receipts/settings";
import { SourcesPanel } from "@/app/settings/SourcesPanel";
import { maskedIngestKey } from "@/lib/live/ingest-key";
import { headers } from "next/headers";
import { DEMO_MESSAGE, PUBLIC_DEMO } from "@/lib/demo";
import { PROVIDERS } from "@/lib/receipts/providers";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai } = await searchParams;
  const run = loadRun(ai, await getSource());
  const view = settingsView();
  const saved = view.keys.filter((k) => k.masked);
  const host = (await headers()).get("host") ?? "127.0.0.1:3100";
  return (
    <>
      <Header run={run} path="/settings" />
      <main className="narrow">
        <div className="page-head">
          <div>
            <h1>Settings: model, key &amp; sources</h1>
            <p className="lede">Bring your own key from any provider. The model only splits free-text decisions into facts; every verdict is still set by code. With no key the app runs AI-off.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Active model</h2>
            {view.active ? <span className="pill s-verified">✓ ready</span> : <span className="pill s-unverifiable">AI off</span>}
          </div>
          {view.active ? (
            <div>{view.active.label} · <span className="mono">{view.active.model}</span> <span className="muted">via {view.active.baseUrlHost}</span></div>
          ) : (
            <div className="muted">{view.activeError}</div>
          )}
          {saved.length ? (
            <ul className="keylist">
              {saved.map((k) => (
                <li key={k.provider}>
                  <span>{k.label} <span className="mono muted">{k.masked}</span></span>
                  <form action={removeKey}>
                    <input type="hidden" name="provider" value={k.provider} />
                    <button type="submit" className="link">Forget key</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {PUBLIC_DEMO ? (
          <>
            <div className="notice info">🔒 {DEMO_MESSAGE}</div>
            <h2 style={{ margin: "22px 0 10px" }}>Supported providers (bring your own key, locally)</h2>
            <div className="card">
              <ul className="keylist" style={{ marginTop: 0 }}>
                {Object.values(PROVIDERS).map((p) => (
                  <li key={p.id}>
                    <span>{p.label}</span>
                    <span className="mono muted small">{p.defaultModel}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="hint">Runs exist for OpenAI gpt-4.1-mini and gpt-5-nano; the header switch shows their saved results. Langdock is untested.</p>
          </>
        ) : (
        <>
        <h2 style={{ margin: "22px 0 10px" }}>1 · Provider and key</h2>
        <SettingsForm keys={view.keys} activeProvider={view.active?.provider ?? null} activeModel={view.active?.model ?? null} baseUrl={view.baseUrl} />

        <h2 style={{ margin: "22px 0 10px" }}>2 · Test and run extraction</h2>
        <RunForms enabled={Boolean(view.active)} />

        <h2 id="sources" style={{ margin: "22px 0 10px" }}>3 · Sources: live telemetry</h2>
        <SourcesPanel endpoint={`http://${host}/api/events`} maskedKey={maskedIngestKey()} hasLlm={Boolean(view.active)} />

        <p className="hint">
          🔒 Keys stay in this machine&apos;s local server process and are never sent back to the browser; only the last 4 characters are shown.
          {view.rememberedOnDisk ? " A model key is saved in .env.local (git-ignored)." : " Model keys are written to disk only if you tick Remember."} The ingest key is stored in .env.local (git-ignored) so the replay and agent scripts can use it. A provider counts as tested only once a run of it exists. Langdock is untested.
        </p>
        </>
        )}
      </main>
    </>
  );
}
