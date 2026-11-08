"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { SOURCE_COOKIE } from "@/app/source";
import { rotateIngestKey } from "@/lib/live/ingest-key";
import { startAgent, startReplay } from "@/lib/live/jobs";
import { resetLive } from "@/lib/live/store";
import { DEMO_MESSAGE, PUBLIC_DEMO } from "@/lib/demo";

export type SourceState = { ok: boolean; message: string; key?: string } | null;

async function selfUrl(): Promise<string> {
  const host = (await headers()).get("host") ?? "127.0.0.1:3100";
  return `http://${host}`;
}

async function showLive() {
  (await cookies()).set(SOURCE_COOKIE, "live", { path: "/", sameSite: "lax", httpOnly: true });
}

export async function generateKey(_prev: SourceState): Promise<SourceState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  const key = rotateIngestKey();
  revalidatePath("/settings");
  return { ok: true, message: "New ingest key. Copy it now; it won't be shown in full again. The old key stops working.", key };
}

export async function runReplay(_prev: SourceState): Promise<SourceState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  try {
    startReplay(await selfUrl());
    await showLive();
    return { ok: true, message: "Replay started: 60 decisions stream in over ~15 s. Open Decisions to watch them arrive." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function runAgent(_prev: SourceState): Promise<SourceState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  try {
    startAgent(await selfUrl());
    await showLive();
    return { ok: true, message: "Built-in agent started on 6 pending requests. Each one appears in Decisions when its run completes." };
  } catch (e) {
    return { ok: false, message: (e as Error).message.replace(/(sk|sk-ant|gsk|AIza)[-_A-Za-z0-9]{8,}/g, "[redacted]") };
  }
}

export async function resetLiveData(_prev: SourceState): Promise<SourceState> {
  if (PUBLIC_DEMO) return { ok: false, message: DEMO_MESSAGE };
  resetLive();
  revalidatePath("/", "layout");
  return { ok: true, message: "Live data cleared (runs/live/ only). The synthetic file and the ingest key are untouched." };
}
