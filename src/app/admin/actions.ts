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
  return staff && staff.isAdmin ? staff : null;
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

/** Attach an existing login (found by its e-mail) to a team member. */
export async function linkLogin(staffId: string, email: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(staffId).success || !z.string().email().safeParse(email.trim()).success) {
    return { ok: false, error: "Vpiši veljaven e-naslov prijave." };
  }
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_staff_login", { p_staff: staffId, p_email: email });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Detach a login from a team member (their records stay). */
export async function unlinkLogin(staffId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(staffId).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_staff_login", { p_staff: staffId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "Uporabniško ime: 3 do 30 znakov, majhne črke, številke, pika ali pomišljaj.");
// Temporary only: the person must choose a stronger one (8+) at first sign-in.
const Password = z.string().min(6, "Začasno geslo naj ima vsaj 6 znakov.").max(72);

/** Gives an existing team member a username + temporary password (they must change it at first sign-in). */
export async function createLogin(staffId: string, username: string, password: string): Promise<ActionResult> {
  const u = Username.safeParse(username);
  const p = Password.safeParse(password);
  if (!z.string().uuid().safeParse(staffId).success) return { ok: false, error: "Neveljaven vnos." };
  if (!u.success) return { ok: false, error: u.error.issues[0].message };
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_login", { p_staff: staffId, p_username: u.data, p_password: p.data });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Sets a new temporary password for someone who forgot theirs; they change it again at next sign-in. */
export async function resetPassword(staffId: string, password: string): Promise<ActionResult> {
  const p = Password.safeParse(password);
  if (!z.string().uuid().safeParse(staffId).success) return { ok: false, error: "Neveljaven vnos." };
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reset_password", { p_staff: staffId, p_password: p.data });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

const NewUser = NewStaff.extend({ username: Username, password: Password });

/** New team member with a login in one step. If the login fails, the new row is removed again. */
export async function addStaffWithLogin(input: z.infer<typeof NewUser>): Promise<ActionResult> {
  const parsed = NewUser.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("staff")
    .insert({ full_name: parsed.data.fullName, role: parsed.data.role, phone: parsed.data.phone?.trim() || null, active: true })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Dodajanje ni uspelo." };
  const { error: loginError } = await supabase.rpc("admin_create_login", {
    p_staff: row.id,
    p_username: parsed.data.username,
    p_password: parsed.data.password,
  });
  if (loginError) {
    await supabase.from("staff").delete().eq("id", row.id);
    return { ok: false, error: loginError.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}
