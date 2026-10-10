"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ROLES = ["manager", "office", "driver", "sales", "events"] as const;

async function adminOnly() {
  const staff = await getCurrentStaff();
  return staff && staff.role === "manager" ? staff : null;
}

const Patch = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  phone: z.string().max(40).nullable().optional(),
});

/**
 * Change a team member's role, activity or contact. Only managers may; the
 * database refuses the same change from anyone else and never lets the last
 * active manager be demoted or deactivated.
 */
export async function updateStaff(id: string, patch: z.infer<typeof Patch>): Promise<ActionResult> {
  const parsed = Patch.safeParse(patch);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };

  const p = parsed.data;
  const row: Record<string, unknown> = {};
  if (p.fullName !== undefined) row.full_name = p.fullName;
  if (p.role !== undefined) row.role = p.role;
  if (p.active !== undefined) row.active = p.active;
  if (p.phone !== undefined) row.phone = p.phone?.trim() || null;
  if (Object.keys(row).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("staff").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

const NewStaff = z.object({
  fullName: z.string().trim().min(1, "Vpiši ime.").max(120),
  role: z.enum(ROLES),
  phone: z.string().max(40).nullable().optional(),
});

/** A team member without a login (like a driver who only gets assigned work). */
export async function addStaff(input: z.infer<typeof NewStaff>): Promise<ActionResult> {
  const parsed = NewStaff.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("staff").insert({ full_name: parsed.data.fullName, role: parsed.data.role, phone: parsed.data.phone?.trim() || null, active: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
