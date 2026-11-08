import { cookies } from "next/headers";
import type { DataSource } from "@/lib/receipts/runs";
import { PUBLIC_DEMO } from "@/lib/demo";

export const SOURCE_COOKIE = "dr_source";

/** Which decision log the UI shows: the labelled synthetic file, or live telemetry. */
export async function getSource(): Promise<DataSource> {
  const value = (await cookies()).get(SOURCE_COOKIE)?.value;
  if (!value) return PUBLIC_DEMO ? "live" : "file"; // the demo opens on the live feed, as in the Loom
  return value === "live" ? "live" : "file";
}
