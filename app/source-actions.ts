"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SOURCE_COOKIE } from "@/app/source";

export async function setSource(form: FormData): Promise<void> {
  const value = form.get("source") === "live" ? "live" : "file";
  (await cookies()).set(SOURCE_COOKIE, value, { path: "/", sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
}
