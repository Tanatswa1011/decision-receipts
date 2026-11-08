import { NextResponse } from "next/server";
import { currentJob } from "@/lib/live/jobs";
import { liveStats } from "@/lib/live/store";

export const dynamic = "force-dynamic";

/** Polled by the live UI (every 2 s) to know when to refresh. Local only; no secrets in the body. */
export async function GET() {
  return NextResponse.json({ ...liveStats(), job: currentJob() });
}
