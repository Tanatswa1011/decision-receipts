"use server";

import { revalidatePath } from "next/cache";
import { loadDecisions } from "@/lib/receipts/data";
import { evaluateAll } from "@/lib/receipts/evaluate";
import { extractClaims, llmConfigFromEnv } from "@/lib/receipts/llm";
import type { ProviderId } from "@/lib/receipts/providers";
import { runPipeline } from "@/lib/receipts/run";
import { applySettings, forgetKey } from "@/lib/receipts/settings";
import { DEMO_MESSAGE, PUBLIC_DEMO } from "@/lib/demo";

export type ActionState = { ok: boolean; message: string } | null;

/** Provider errors are passed through, but anything that looks like a key is cut out. */
function scrub(message: string): string {
  return message.replace(/(sk|sk-ant|gsk|AIza)[-_A-Za-z0-9]{8,}/g, "[redacted]");
}

export async function saveSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  try {
    applySettings({
      provider: String(form.get("provider")) as ProviderId,
      model: String(form.get("model") ?? ""),
      apiKey: String(form.get("apiKey") ?? ""),
      baseUrl: String(form.get("baseUrl") ?? ""),
      remember: form.get("remember") === "on",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: form.get("remember") === "on" ? "Saved on this machine (.env.local, git-ignored)." : "Saved for this session only (gone when the server restarts)." };
  } catch (error) {
    return { ok: false, message: scrub((error as Error).message) };
  }
}

export async function removeKey(form: FormData): Promise<void> {
  if (PUBLIC_DEMO) return;
  forgetKey(String(form.get("provider")) as ProviderId);
  revalidatePath("/", "layout");
}

export async function testConnection(_prev: ActionState): Promise<ActionState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  try {
    const cfg = llmConfigFromEnv();
    const decision = loadDecisions().find((d) => d.receipt_no === 14)!;
    const result = await extractClaims(decision, cfg);
    const tokens = result.usage ? `, ${result.usage.prompt_tokens + result.usage.completion_tokens} tokens` : "";
    if (!result.ok) {
      return { ok: false, message: `Connected to ${cfg.providerLabel} / ${cfg.model}, but its output was rejected by the schema check: ${result.rejectedOutput?.error}` };
    }
    return {
      ok: true,
      message: `${cfg.providerLabel} / ${cfg.model} works: split receipt #14 into ${result.claims.length} claims in ${(result.latencyMs / 1000).toFixed(2)} s${tokens}${result.rejectedClaims.length ? `, ${result.rejectedClaims.length} ungrounded claim(s) rejected` : ""}.`,
    };
  } catch (error) {
    return { ok: false, message: scrub((error as Error).message) };
  }
}

export async function runExtraction(_prev: ActionState): Promise<ActionState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  try {
    const { file, summary } = await runPipeline({ mode: "llm" });
    evaluateAll();
    revalidatePath("/", "layout");
    return {
      ok: summary.rejected_model_outputs < summary.decisions,
      message: `Done: ${file}. ${summary.flagged} flagged, ${summary.rejected_model_outputs} model outputs rejected, ${summary.rejected_model_claims} ungrounded claims rejected. Metrics updated.`,
    };
  } catch (error) {
    return { ok: false, message: scrub((error as Error).message) };
  }
}
