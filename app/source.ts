import { cookies } from "next/headers";
import type { DataSource } from "@/lib/receipts/runs";

export const SOURCE_COOKIE = "dr_source";

/** Which decision log the UI shows: the labelled synthetic file, or live telemetry. */
export async function getSource(): Promise<DataSource> {
  return (await cookies()).get(SOURCE_COOKIE)?.value === "live" ? "live" : "file";
}
