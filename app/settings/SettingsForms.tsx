"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { runExtraction, saveSettings, testConnection, type ActionState } from "@/app/settings/actions";

type KeyRow = { provider: string; label: string; keyEnv: string | null; masked: string | null; defaultModel: string; needsBaseUrl: boolean };

function Submit({ children, pendingText, disabled }: { children: React.ReactNode; pendingText: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || disabled}>{pending ? pendingText : children}</button>;
}
function SubmitSecondary({ children, pendingText, disabled }: { children: React.ReactNode; pendingText: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="secondary" disabled={pending || disabled}>{pending ? pendingText : children}</button>;
}

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`notice ${state.ok ? "ok" : "bad"}`} role="status">{state.message}</p>;
}

export function SettingsForm({ keys, activeProvider, activeModel, baseUrl }: { keys: KeyRow[]; activeProvider: string | null; activeModel: string | null; baseUrl: string }) {
  const [state, action] = useActionState(saveSettings, null);
  const [provider, setProvider] = useState(activeProvider ?? "openai");
  const row = keys.find((k) => k.provider === provider)!;
  return (
    <form action={action} className="card form" autoComplete="off">
      <div className="row2">
      <label>
        Provider
        <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {keys.map((k) => <option key={k.provider} value={k.provider}>{k.label}</option>)}
        </select>
      </label>
      <label>
        Model
        <input name="model" key={provider} defaultValue={provider === activeProvider ? activeModel ?? "" : ""} placeholder={row.defaultModel} />
        <span className="hint">Leave empty for {row.defaultModel}</span>
      </label>
      </div>
      {row.keyEnv ? (
        <label>
          API key {row.masked ? <span className="hint">saved as {row.masked}. Leave empty to keep it.</span> : null}
          <input name="apiKey" type="password" placeholder="Paste your key" spellCheck={false} />
        </label>
      ) : <p className="muted small">No key needed (local model).</p>}
      <label>
        Base URL {row.needsBaseUrl ? <span className="hint">required for this provider</span> : <span className="hint">optional, leave empty for the default</span>}
        <input name="baseUrl" defaultValue={baseUrl} placeholder={row.needsBaseUrl ? "https://…/v1" : "leave empty for the default"} />
      </label>
      <label className="check">
        <input type="checkbox" name="remember" /> Remember on this machine (writes <code>.env.local</code>, git-ignored)
      </label>
      <Submit pendingText="Saving…">Save settings</Submit>
      <Result state={state} />
    </form>
  );
}

export function RunForms({ enabled }: { enabled: boolean }) {
  const [testState, testAction] = useActionState(testConnection, null);
  const [runState, runAction] = useActionState(runExtraction, null);
  return (
    <div className="card steps">
      <form action={testAction}>
        <div className="step">
          <div><b>Test the key</b><div className="hint">One call: the model splits receipt #14 into facts.</div></div>
          <SubmitSecondary disabled={!enabled} pendingText="Testing…">Test on receipt #14</SubmitSecondary>
        </div>
        <Result state={testState} />
      </form>
      <form action={runAction}>
        <div className="step">
          <div><b>Run on all 60 decisions</b><div className="hint">About a minute. Adds this model to the AI on/off switch and updates Results.</div></div>
          <Submit disabled={!enabled} pendingText="Running… about a minute">Run AI extraction</Submit>
        </div>
        <Result state={runState} />
      </form>
      {!enabled ? <p className="hint">Save a key first.</p> : null}
    </div>
  );
}
