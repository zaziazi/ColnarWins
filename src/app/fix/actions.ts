"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRealStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { notifyStaff } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SubmitInput = z.object({
  kind: z.enum(["problem", "idea"]),
  message: z.string().trim().min(3, "Napiši vsaj nekaj besed.").max(2000, "Največ 2000 znakov."),
  pagePath: z.string().max(300).optional().default(""),
  pageTitle: z.string().max(200).optional().default(""),
  device: z.string().max(120).optional().default(""),
});

/** Any signed-in staff member reports a problem or suggests something. Saved as themselves, never as the "view as" person. */
export async function submitFix(input: z.input<typeof SubmitInput>): Promise<ActionResult> {
  const parsed = SubmitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };

  const me = await getRealStaff();
  if (!me) return { ok: false, error: "Seja je potekla. Prijavi se znova." };

  const supabase = await createClient();

  // a stuck button or a runaway script must not flood the list
  const { count } = await supabase
    .from("fix_request")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", me.id)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 10) return { ok: false, error: "Poslal si že veliko predlogov v kratkem času. Poskusi čez eno uro." };

  const p = parsed.data;
  const { error } = await supabase.from("fix_request").insert({
    staff_id: me.id,
    staff_name: me.fullName,
    staff_role: me.role,
    kind: p.kind,
    message: p.message,
    page_path: p.pagePath || null,
    page_title: p.pageTitle || null,
    device: p.device || null,
  });
  if (error) return { ok: false, error: error.message };

  // tell the admin (never blocks, never throws)
  try {
    const { data: admins } = await createAdminClient().from("staff").select("id").eq("is_admin", true).eq("active", true);
    await notifyStaff(
      ((admins ?? []) as { id: string }[]).map((a) => a.id),
      { title: `🔧 ${p.kind === "problem" ? "Napaka" : "Predlog"}: ${me.fullName}`, body: p.message.slice(0, 120), url: "/admin/fix", tag: "fix" },
      { exceptStaffId: me.id },
    );
  } catch {
    /* the request is saved; the push is only a courtesy */
  }

  revalidatePath("/admin/fix");
  return { ok: true };
}

const Id = z.string().uuid();

async function adminOnly() {
  const me = await getRealStaff();
  return me?.isAdmin ? me : null;
}

export async function setFixStatus(id: string, status: "new" | "done"): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("fix_request").update({ status, done_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/fix");
  return { ok: true };
}

export async function deleteFix(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("fix_request").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/fix");
  return { ok: true };
}
