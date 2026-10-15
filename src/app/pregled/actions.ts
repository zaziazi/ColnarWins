"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data";
import { getBrief } from "@/lib/brief";

/** Writes a fresh summary (the page otherwise reuses the one from the last three hours). */
export async function refreshBrief(): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager") return { ok: false, error: "Ni dostopa." };
  await getBrief({ force: true });
  revalidatePath("/pregled");
  return { ok: true };
}
