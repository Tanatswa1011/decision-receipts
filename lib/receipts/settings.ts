/**
 * In-app model settings (bring your own key).
 *
 * - The key is stored only on the server: in this Node process's environment and,
 *   if "remember" is ticked, in `.env.local` (git-ignored by `.env.*`). It is never
 *   sent back to the browser; the UI only ever sees the last 4 characters.
 * - The dev server binds to 127.0.0.1, so the settings page isn't reachable from the network.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROVIDERS, resolveProvider, type ProviderId } from "@/lib/receipts/providers";

const ENV_LOCAL = join(process.cwd(), ".env.local");

export function mask(key: string | undefined | null): string | null {
  if (!key) return null;
  return `••••${key.slice(-4)}`;
}

function upsertEnvLocal(values: Record<string, string | null>) {
  const lines = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/) : [];
  const kept = lines.filter((line) => {
    const name = line.split("=")[0]?.trim();
    return line.trim() !== "" && !(name && name in values);
  });
  for (const [name, value] of Object.entries(values)) {
    if (value != null && value !== "") kept.push(`${name}=${value}`);
  }
  writeFileSync(ENV_LOCAL, kept.join("\n") + "\n", { mode: 0o600 });
}

export type SettingsInput = {
  provider: ProviderId;
  model: string;
  apiKey: string; // empty = keep the existing key
  baseUrl: string;
  remember: boolean;
};

export function applySettings(input: SettingsInput): void {
  const spec = PROVIDERS[input.provider];
  if (!spec) throw new Error("Unknown provider.");
  const key = input.apiKey.trim();
  if (key && /\s/.test(key)) throw new Error("The key contains spaces. Paste it again without line breaks.");
  const updates: Record<string, string | null> = {
    LLM_PROVIDER: spec.id,
    LLM_MODEL: input.model.trim() || null,
    LLM_BASE_URL: input.baseUrl.trim() || null,
  };
  if (spec.keyEnv && key) updates[spec.keyEnv] = key;
  for (const [name, value] of Object.entries(updates)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  if (input.remember) upsertEnvLocal(updates);
}

export function forgetKey(provider: ProviderId): void {
  const spec = PROVIDERS[provider];
  if (!spec?.keyEnv) return;
  delete process.env[spec.keyEnv];
  const wasActive = process.env.LLM_PROVIDER === spec.id;
  if (wasActive) for (const name of ["LLM_PROVIDER", "LLM_MODEL", "LLM_BASE_URL"]) delete process.env[name];
  if (existsSync(ENV_LOCAL)) upsertEnvLocal(wasActive ? { [spec.keyEnv]: null, LLM_PROVIDER: null, LLM_MODEL: null, LLM_BASE_URL: null } : { [spec.keyEnv]: null });
}

export type SettingsView = {
  active: { provider: ProviderId; label: string; model: string; baseUrlHost: string } | null;
  activeError: string | null;
  keys: Array<{ provider: ProviderId; label: string; keyEnv: string | null; masked: string | null; defaultModel: string; needsBaseUrl: boolean }>;
  baseUrl: string;
  rememberedOnDisk: boolean;
};

export function settingsView(): SettingsView {
  let active: SettingsView["active"] = null;
  let activeError: string | null = null;
  try {
    const r = resolveProvider();
    active = { provider: r.spec.id, label: r.spec.label, model: r.model, baseUrlHost: new URL(r.baseUrl).host };
  } catch (error) {
    const msg = (error as Error).message;
    activeError = msg.startsWith("No API key found") ? "No key saved yet. Paste one below, or keep using AI off." : msg;
  }
  const remembered = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "";
  return {
    active,
    activeError,
    keys: Object.values(PROVIDERS).map((p) => ({
      provider: p.id,
      label: p.label,
      keyEnv: p.keyEnv,
      masked: p.keyEnv ? mask(process.env[p.keyEnv]) : null,
      defaultModel: p.defaultModel,
      needsBaseUrl: p.defaultBaseUrl == null,
    })),
    baseUrl: process.env.LLM_BASE_URL ?? "",
    rememberedOnDisk: /_API_KEY=./.test(remembered),
  };
}
