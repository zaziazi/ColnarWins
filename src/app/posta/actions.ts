"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { canUseOffice } from "@/lib/office";
import { INBOX_LABELS } from "@/lib/inbox/labels";
import { triageInboxEmail } from "@/lib/inbox/triage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupplierBill } from "@/lib/finance/bills";
import { mailConfigured, sendMail } from "@/lib/documents/email";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const Id = z.string().uuid();

async function guard() {
  const staff = await getCurrentStaff();
  return staff && canUseOffice(staff.role) ? staff : null;
}

function refresh() {
  revalidatePath("/posta");
  revalidatePath("/finance/dobavitelji");
}

export async function setLabel(id: string, label: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !(INBOX_LABELS as readonly string[]).includes(label)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("inbox_email")
    .update({ label, label_confirmed: true, status: label === "newsletter" ? "ignored" : "needs_decision" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setStatus(id: string, status: "new" | "needs_decision" | "done" | "ignored"): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !["new", "needs_decision", "done", "ignored"].includes(status)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_email").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function assignEmail(id: string, staffId: string | null): Promise<ActionResult> {
  if (!Id.safeParse(id).success || (staffId !== null && !Id.safeParse(staffId).success)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("inbox_email").update({ assigned_to: staffId }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Sends the (edited) reply from the office mailbox. A person always presses the button. */
export async function sendInboxReply(id: string, subject: string, body: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !body.trim() || body.length > 5000) return { ok: false, error: "Napišite besedilo odgovora." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  if (!mailConfigured()) return { ok: false, error: "Pošiljanje e-pošte še ni nastavljeno. Odgovorite iz e-pošte." };
  const supabase = await createClient();
  const { data: m } = await supabase.from("inbox_email").select("from_email,subject").eq("id", id).maybeSingle();
  if (!m?.from_email) return { ok: false, error: "Pošiljatelj nima e-naslova." };
  const r = await sendMail({
    to: m.from_email as string,
    subject: subject.trim() || `Re: ${(m.subject as string | null) ?? ""}`.trim(),
    text: body,
  });
  if (!r.ok) return { ok: false, error: `Pošiljanje ni uspelo: ${r.error}` };
  await supabase
    .from("inbox_email")
    .update({ reply_sent_at: new Date().toISOString(), reply_sent_by: staff.id, status: "done" })
    .eq("id", id);
  refresh();
  return { ok: true };
}

export async function retryInboxTriage(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Strežnik nima dostopa do baze (SUPABASE_SERVICE_ROLE_KEY)." };
  }
  const r = await triageInboxEmail(admin, id);
  refresh();
  return r.status === "failed" ? { ok: false, error: r.error ?? "Branje ni uspelo." } : { ok: true };
}

const BillForm = z.object({
  supplierName: z.string().trim().min(1).max(200),
  number: z.string().trim().max(80).nullable().optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amountGross: z.number().positive().max(10_000_000),
  iban: z.string().trim().max(60).nullable().optional(),
  reference: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Add a supplier bill by hand, optionally from an e-mail (links the two). */
export async function addSupplierBill(input: z.infer<typeof BillForm>, emailId?: string | null): Promise<ActionResult> {
  const p = BillForm.safeParse(input);
  if (!p.success) return { ok: false, error: "Preverite znesek in ime dobavitelja." };
  if (emailId && !Id.safeParse(emailId).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();

  let attachmentPath: string | null = null;
  if (emailId) {
    const { data: m } = await supabase.from("inbox_email").select("attachments").eq("id", emailId).maybeSingle();
    const atts = (m?.attachments as { path: string; type: string }[] | null) ?? [];
    attachmentPath = atts.find((a) => /pdf|image/i.test(a.type))?.path ?? null;
  }
  try {
    const r = await createSupplierBill(supabase, { ...p.data, amountGross: p.data.amountGross, sourceEmailId: emailId ?? null, attachmentPath, createdBy: staff.id });
    if (emailId) await supabase.from("inbox_email").update({ linked_kind: "bill", linked_id: r.id, status: "done" }).eq("id", emailId);
    refresh();
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Shranjevanje ni uspelo." };
  }
}

export async function attachmentUrl(path: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!path || path.includes("..")) return { ok: false, error: "Neveljavna datoteka." };
  if (isDemoMode) return { ok: false, error: "Demo." };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("inbox-attachments").createSignedUrl(path, 300);
  if (error || !data) return { ok: false, error: "Priloge ni mogoče odpreti." };
  return { ok: true, url: data.signedUrl };
}
