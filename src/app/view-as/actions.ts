"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRealStaff, VIEW_AS_COOKIE } from "@/lib/data";

/** Admin only: show the app as another team member (or back as yourself with null). */
export async function setViewAs(staffId: string | null): Promise<{ ok: boolean }> {
  const real = await getRealStaff();
  if (!real?.isAdmin) return { ok: false };

  const jar = await cookies();
  if (staffId === null || !z.string().uuid().safeParse(staffId).success) {
    jar.delete(VIEW_AS_COOKIE);
  } else {
    jar.set(VIEW_AS_COOKIE, staffId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
