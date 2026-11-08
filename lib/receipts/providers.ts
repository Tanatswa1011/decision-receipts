/**
 * Bring-your-own-key provider selection. The extractor is not tied to one vendor.
 *
 * Pick explicitly with LLM_PROVIDER (or --provider=), or leave it unset and the
 * first provider whose API key is present in .env is used.
 *
 * Only providers marked `tested: true` have actually been run against this code.
 * Everything else is wired by documentation and is UNTESTED until a run says so.
 */
export type ProviderId = "openai" | "anthropic" | "gemini" | "mistral" | "groq" | "openrouter" | "ollama" | "langdock" | "custom";

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  protocol: "openai" | "anthropic";
  keyEnv: string | null; // null = no key needed (local)
  defaultBaseUrl: string | null; // null = must be set via LLM_BASE_URL
  defaultModel: string;
  supportsJsonMode: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  openai: { id: "openai", label: "OpenAI", protocol: "openai", keyEnv: "OPENAI_API_KEY", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini", supportsJsonMode: true },
  anthropic: { id: "anthropic", label: "Anthropic", protocol: "anthropic", keyEnv: "ANTHROPIC_API_KEY", defaultBaseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-haiku-5-5", supportsJsonMode: false },
  gemini: { id: "gemini", label: "Google Gemini (OpenAI-compatible endpoint)", protocol: "openai", keyEnv: "GEMINI_API_KEY", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", supportsJsonMode: true },
  mistral: { id: "mistral", label: "Mistral", protocol: "openai", keyEnv: "MISTRAL_API_KEY", defaultBaseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", supportsJsonMode: true },
  groq: { id: "groq", label: "Groq", protocol: "openai", keyEnv: "GROQ_API_KEY", defaultBaseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", supportsJsonMode: true },
  openrouter: { id: "openrouter", label: "OpenRouter", protocol: "openai", keyEnv: "OPENROUTER_API_KEY", defaultBaseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini", supportsJsonMode: true },
  ollama: { id: "ollama", label: "Ollama (local, no key)", protocol: "openai", keyEnv: null, defaultBaseUrl: "http://localhost:11434/v1", defaultModel: "llama3.1", supportsJsonMode: true },
  langdock: { id: "langdock", label: "Langdock (OpenAI-compatible, UNTESTED)", protocol: "openai", keyEnv: "LANGDOCK_API_KEY", defaultBaseUrl: null, defaultModel: "gpt-4.1-mini", supportsJsonMode: true },
  custom: { id: "custom", label: "Any OpenAI-compatible endpoint", protocol: "openai", keyEnv: "LLM_API_KEY", defaultBaseUrl: null, defaultModel: "gpt-4.1-mini", supportsJsonMode: true },
};

/** Order used when LLM_PROVIDER is not set: first key found wins. */
const AUTO_ORDER: ProviderId[] = ["openai", "anthropic", "gemini", "mistral", "groq", "openrouter", "langdock", "custom"];

export type ResolvedProvider = {
  spec: ProviderSpec;
  baseUrl: string;
  apiKey: string | null;
  model: string;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export function resolveProvider(opts: { provider?: string; model?: string } = {}): ResolvedProvider {
  const requested = (opts.provider ?? env("LLM_PROVIDER"))?.toLowerCase() as ProviderId | undefined;
  let spec: ProviderSpec | undefined;
  if (requested) {
    spec = PROVIDERS[requested];
    if (!spec) throw new Error(`Unknown LLM_PROVIDER "${requested}". Use one of: ${Object.keys(PROVIDERS).join(", ")}.`);
  } else {
    spec = AUTO_ORDER.map((id) => PROVIDERS[id]).find((p) => p.keyEnv && env(p.keyEnv));
    if (!spec) {
      throw new Error(
        `No API key found. Put ONE of these in .env (never in chat): ${AUTO_ORDER.map((id) => PROVIDERS[id].keyEnv).join(", ")}. Or set LLM_PROVIDER=ollama for a local model.`,
      );
    }
  }
  const apiKey = spec.keyEnv ? env(spec.keyEnv) ?? null : null;
  if (spec.keyEnv && !apiKey) throw new Error(`${spec.label} selected but ${spec.keyEnv} is not set in .env.`);
  // Backwards compatible: OPENAI_BASE_URL still works for the openai provider.
  const baseUrl = env("LLM_BASE_URL") ?? (spec.id === "openai" ? env("OPENAI_BASE_URL") : undefined) ?? spec.defaultBaseUrl;
  if (!baseUrl) throw new Error(`${spec.label} needs LLM_BASE_URL in .env.`);
  return {
    spec,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model: opts.model ?? env("LLM_MODEL") ?? env("MODEL_A") ?? spec.defaultModel,
  };
}
