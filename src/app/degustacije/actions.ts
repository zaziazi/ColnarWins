"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { getDrustvoThread } from "@/lib/drustva/data";
import { triageTask } from "@/lib/drustva/triage";
import { parseWebReservation } from "@/lib/degustacije/web-parse";
import { degustacijeMailConfigured, sendDegustacijeMail } from "@/lib/degustacije/mail";
import { ljubljanaInstant, normalizePhone } from "@/lib/degustacije/messages";
import { notifyBooking, type NotifyResult } from "@/lib/degustacije/people";
import type { DrustvoMessage } from "@/lib/types";
import { canUseDrustva } from "./constants";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Id = z.string().uuid();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function refresh() {
  revalidatePath("/degustacije");
  revalidatePath("/degustacije/koledar");
}

async function guard() {
  const staff = await getCurrentStaff();
  return staff && canUseDrustva(staff.role) ? staff : null;
}

/** Settings, people and roles are for managers only. */
async function adminGuard() {
  const staff = await getCurrentStaff();
  return staff && staff.role === "manager" ? staff : null;
}

// ------------------------------------------------------------------- društva

const STAGES = ["not_contacted", "in_sequence", "replied", "interested", "later", "booked", "visited", "not_interested", "unsubscribed", "bounced"] as const;

const Patch = z.object({
  phone: z.string().max(60).nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  wave: z.number().int().min(0).max(4).nullable().optional(),
  nextAction: z.string().max(200).nullable().optional(),
  nextActionOn: IsoDate.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  tier: z.enum(["focus", "fifty_fifty", "not_chosen"]).optional(),
});

export async function updateDrustvo(id: string, patch: z.infer<typeof Patch>): Promise<ActionResult> {
  const parsed = Patch.safeParse(patch);
  if (!Id.safeParse(id).success || !parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };

  const p = parsed.data;
  const row: Record<string, unknown> = {};
  if (p.phone !== undefined) row.phone = p.phone?.trim() || null;
  if (p.contactName !== undefined) row.contact_name = p.contactName?.trim() || null;
  if (p.stage !== undefined) row.stage = p.stage;
  if (p.wave !== undefined) row.wave = p.wave;
  if (p.nextAction !== undefined) row.next_action = p.nextAction?.trim() || null;
  if (p.nextActionOn !== undefined) row.next_action_on = p.nextActionOn;
  if (p.notes !== undefined) row.notes = p.notes?.trim() || null;
  if (p.tier !== undefined) row.tier = p.tier;
  if (Object.keys(row).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("drustvo").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function loadThread(drustvoId: string): Promise<DrustvoMessage[]> {
  if (!Id.safeParse(drustvoId).success || !(await guard())) return [];
  return getDrustvoThread(drustvoId);
}

// ------------------------------------------------------------------- reply tasks

/** The person closes a task without answering. */
export async function dismissTask(taskId: string): Promise<ActionResult> {
  if (!Id.safeParse(taskId).success) return { ok: false, error: "Neveljavna naloga." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("drustvo_reply_task")
    .update({ status: "dismissed", decided_by: staff.id, decided_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

const CallOutcome = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("booked") }),
  z.object({ outcome: z.literal("later"), callAgainOn: IsoDate }),
  z.object({ outcome: z.literal("not_interested") }),
]);

/** What came out of the phone call: closes the task and moves the društvo to the right stage. */
export async function finishCall(taskId: string, drustvoId: string | null, result: z.infer<typeof CallOutcome>): Promise<ActionResult> {
  const parsed = CallOutcome.safeParse(result);
  if (!Id.safeParse(taskId).success || !parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();

  const o = parsed.data;
  if (drustvoId) {
    const patch =
      o.outcome === "booked"
        ? { stage: "booked" }
        : o.outcome === "later"
          ? { stage: "later", next_action: "Poklicati ponovno", next_action_on: o.callAgainOn }
          : { stage: "not_interested" };
    const { error } = await supabase.from("drustvo").update(patch).eq("id", drustvoId);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase
    .from("drustvo_reply_task")
    .update({ status: "done", decided_by: staff.id, decided_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** An "unknown sender" reply: attach it to a društvo from the list. */
export async function linkTaskToDrustvo(taskId: string, drustvoId: string): Promise<ActionResult> {
  if (!Id.safeParse(taskId).success || !Id.safeParse(drustvoId).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data: task } = await supabase.from("drustvo_reply_task").select("message_id").eq("id", taskId).single();
  if (!task) return { ok: false, error: "Naloga ne obstaja." };
  const a = await supabase.from("drustvo_reply_task").update({ drustvo_id: drustvoId }).eq("id", taskId);
  const b = await supabase.from("drustvo_message").update({ drustvo_id: drustvoId }).eq("id", task.message_id);
  const c = await supabase.from("drustvo").update({ stage: "replied" }).eq("id", drustvoId).in("stage", ["not_contacted", "in_sequence"]);
  const err = a.error ?? b.error ?? c.error;
  if (err) return { ok: false, error: err.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- bookings (the tasting calendar)

const Hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const Booking = z.object({
  id: Id.optional(),
  drustvoId: Id.nullable().optional(),
  webReservationId: Id.nullable().optional(),
  groupName: z.string().trim().min(1, "Vpiši ime skupine.").max(200),
  visitDate: IsoDate,
  startTime: Hhmm,
  endTime: Hhmm.nullable().optional(),
  peoplePlanned: z.number().int().min(0).max(1000).nullable().optional(),
  peopleActual: z.number().int().min(0).max(1000).nullable().optional(),
  winePreferences: z.string().max(500).nullable().optional(),
  food: z.boolean(),
  foodNotes: z.string().max(1000).nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  contactPhone: z.string().max(60).nullable().optional(),
  contactEmail: z.string().max(200).nullable().optional(),
  presenterId: Id.nullable().optional(),
  kitchenId: Id.nullable().optional(),
  status: z.enum(["tentative", "confirmed", "visited", "cancelled"]),
  wineSalesEur: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Save even though the day is full / not a hosting day / blocked. */
  force: z.boolean().optional(),
});
export type BookingInput = z.infer<typeof Booking>;

export type SaveBookingResult = { ok: true; id: string } | { ok: false; error: string; warning?: boolean };

const dowOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday

/**
 * Saves a tasting. Day-full / blocked / non-hosting-day come back as a
 * warning the person can override (ad-hoc tastings happen), everything else is
 * a hard error. A confirmed tasting that starts within 24 hours tells the
 * presenter and the kitchen straight away; the evening-before job covers the rest.
 */
export async function saveBooking(input: BookingInput): Promise<SaveBookingResult> {
  const parsed = Booking.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true, id: "demo" };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const b = parsed.data;
  if (b.endTime && b.endTime <= b.startTime) return { ok: false, error: "Konec mora biti po začetku." };
  const supabase = await createClient();

  if (b.status !== "cancelled" && !b.force) {
    const { data: st } = await supabase.from("drustvo_settings").select("max_groups_per_day,hosting_weekdays,blackout_dates").eq("id", 1).single();
    if (st) {
      if ((st.blackout_dates as string[]).includes(b.visitDate)) return { ok: false, warning: true, error: "Ta datum je med blokiranimi (Nastavitve)." };
      if (!(st.hosting_weekdays as number[]).includes(dowOf(b.visitDate))) return { ok: false, warning: true, error: "Ta dan v tednu ni na seznamu dni za skupine (Nastavitve)." };
      let q = supabase.from("group_booking").select("id", { count: "exact", head: true }).eq("visit_date", b.visitDate).neq("status", "cancelled");
      if (b.id) q = q.neq("id", b.id);
      const { count } = await q;
      if ((count ?? 0) >= (st.max_groups_per_day as number)) return { ok: false, warning: true, error: "Ta dan je že poln (največ skupin na dan v Nastavitvah)." };
    }
  }

  const row = {
    drustvo_id: b.drustvoId ?? null,
    group_name: b.groupName,
    source: b.webReservationId ? "web" : b.drustvoId ? "drustvo" : "manual",
    visit_date: b.visitDate,
    arrival_time: b.startTime,
    end_time: b.endTime ?? null,
    people_planned: b.peoplePlanned ?? null,
    people_actual: b.peopleActual ?? null,
    wine_preferences: b.winePreferences?.trim() || null,
    food: b.food,
    food_notes: b.foodNotes?.trim() || null,
    contact_name: b.contactName?.trim() || null,
    contact_phone: b.contactPhone?.trim() || null,
    contact_email: b.contactEmail?.trim() || null,
    presenter_id: b.presenterId ?? null,
    kitchen_id: b.food ? (b.kitchenId ?? null) : null,
    status: b.status,
    wine_sales_eur: b.wineSalesEur ?? null,
    notes: b.notes?.trim() || null,
    web_reservation_id: b.webReservationId ?? null,
  };

  let id = b.id;
  if (id) {
    const { error } = await supabase.from("group_booking").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("group_booking").insert({ ...row, created_by: staff.id }).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Shranjevanje ni uspelo." };
    id = data.id as string;
  }

  if (b.drustvoId) {
    const stage = b.status === "visited" ? "visited" : b.status === "confirmed" || b.status === "tentative" ? "booked" : null;
    if (stage) await supabase.from("drustvo").update({ stage }).eq("id", b.drustvoId).not("stage", "in", "(unsubscribed,bounced)");
  }
  if (b.webReservationId) {
    await supabase.from("web_reservation").update({ status: b.status === "cancelled" ? "declined" : "confirmed" }).eq("id", b.webReservationId);
  }

  // starts within 24 hours: do not wait for the evening-before job
  if (b.status === "confirmed" && (b.presenterId || (b.food && b.kitchenId))) {
    const start = ljubljanaInstant(b.visitDate, b.startTime);
    const hours = (start.getTime() - Date.now()) / 3600_000;
    if (hours > 0 && hours <= 24) await notifyBooking(supabase, id!);
  }
  refresh();
  return { ok: true, id: id! };
}

export async function setBookingStatus(id: string, status: "tentative" | "confirmed" | "visited" | "cancelled"): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("group_booking").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** "Obvesti zdaj": sends the presenter / kitchen messages now (again, if `force`). */
export async function notifyBookingNow(id: string): Promise<{ ok: true; result: NotifyResult } | { ok: false; error: string }> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: false, error: "Demo." };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const result = await notifyBooking(supabase, id, { force: true });
  refresh();
  return { ok: true, result };
}

/** The person sent the text by hand (wa.me / sms link): remember that it went out. */
export async function markNotified(id: string, who: "presenter" | "kitchen"): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_booking")
    .update({ [who === "presenter" ? "presenter_notified_at" : "kitchen_notified_at"]: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- people (presenters, kitchen)

const PersonInput = z.object({
  id: Id.optional(),
  name: z.string().trim().min(1, "Vpiši ime.").max(120),
  phone: z.string().max(40).nullable().optional(),
  role: z.enum(["presenter", "kitchen", "both"]),
  channel: z.enum(["sms", "whatsapp"]),
  isDefaultKitchen: z.boolean(),
});

export async function savePerson(input: z.infer<typeof PersonInput>): Promise<ActionResult> {
  const parsed = PersonInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminGuard())) return { ok: false, error: "Ni dostopa." };
  const p = parsed.data;
  if (p.phone && !normalizePhone(p.phone)) return { ok: false, error: "Telefonska številka ni veljavna (npr. 041 123 456)." };
  const supabase = await createClient();
  const isKitchen = p.role !== "presenter";
  if (p.isDefaultKitchen && isKitchen) await supabase.from("degustacija_person").update({ is_default_kitchen: false }).eq("is_default_kitchen", true);
  const row = {
    name: p.name,
    phone: p.phone?.trim() || null,
    role: p.role,
    channel: p.channel,
    is_default_kitchen: p.isDefaultKitchen && isKitchen,
  };
  const { error } = p.id
    ? await supabase.from("degustacija_person").update(row).eq("id", p.id)
    : await supabase.from("degustacija_person").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/degustacije");
  revalidatePath("/degustacije/nova");
  return { ok: true };
}

export async function deletePerson(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminGuard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("degustacija_person").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/degustacije");
  return { ok: true };
}

// ------------------------------------------------------------------- website reservations

export async function setWebStatus(id: string, status: "declined" | "dismissed"): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("web_reservation").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Sends the person's reply to the customer from the website mailbox (SMTP). */
export async function sendWebReply(id: string, subject: string, body: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success || !body.trim() || body.length > 5000) return { ok: false, error: "Napiši besedilo odgovora." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  if (!degustacijeMailConfigured()) return { ok: false, error: "Pošiljanje iz nabiralnika za degustacije še ni nastavljeno (DEGUSTACIJE_SMTP_*). Odgovori iz e-pošte." };
  const supabase = await createClient();
  const { data: w } = await supabase.from("web_reservation").select("id,from_email,subject,message_id,reply_sent_at").eq("id", id).maybeSingle();
  if (!w?.from_email) return { ok: false, error: "Pošiljatelj nima e-naslova." };
  const r = await sendDegustacijeMail({
    to: w.from_email as string,
    subject: subject.trim() || `Re: ${(w.subject as string | null) ?? "Rezervacija degustacije"}`,
    text: body,
    inReplyTo: (w.message_id as string).startsWith("<") ? (w.message_id as string) : undefined,
  });
  if (!r.ok) return { ok: false, error: `Pošiljanje ni uspelo: ${r.error}` };
  await supabase.from("web_reservation").update({ reply_sent_at: new Date().toISOString() }).eq("id", id);
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- settings

const Settings = z.object({
  infoSheet: z.string().max(20000),
  rules: z.string().max(10000),
  maxGroupsPerDay: z.number().int().min(1).max(20),
  hostingWeekdays: z.array(z.number().int().min(1).max(7)).max(7),
  blackoutDates: z.array(IsoDate).max(400),
  notifyStaffIds: z.array(Id).max(20),
});

export async function saveSettings(input: z.infer<typeof Settings>): Promise<ActionResult> {
  const parsed = Settings.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await adminGuard())) return { ok: false, error: "Ni dostopa." };
  const s = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("drustvo_settings")
    .update({
      info_sheet: s.infoSheet,
      rules: s.rules,
      max_groups_per_day: s.maxGroupsPerDay,
      hosting_weekdays: [...new Set(s.hostingWeekdays)].sort(),
      blackout_dates: [...new Set(s.blackoutDates)].sort(),
      notify_staff_ids: s.notifyStaffIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/degustacije");
  return { ok: true };
}

// ------------------------------------------------------------------- sending a reply

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

const SendInput = z.object({ taskId: Id, subject: z.string().max(200), body: z.string().min(1).max(5000) });

/**
 * The one human decision: sends the (possibly edited) text as a reply in the
 * same Instantly thread, from the mailbox the reply came in on. Nothing is
 * ever sent without this tap.
 */
export async function sendReply(input: z.infer<typeof SendInput>): Promise<ActionResult> {
  const parsed = SendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Napiši besedilo odgovora." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) return { ok: false, error: "Pošiljanje še ni nastavljeno (INSTANTLY_API_KEY). Odgovori v Instantly." };

  const { taskId, subject, body } = parsed.data;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("drustvo_reply_task")
    .select("id,status,drustvo_id,decided_at,draft_body,drustvo_message(instantly_email_id,email_account,subject)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Naloga ne obstaja." };
  if (["sent", "done", "dismissed"].includes(task.status as string)) return { ok: false, error: "To je že obdelano." };
  type Target = { instantly_email_id: string | null; email_account: string | null; subject: string | null };
  let m = task.drustvo_message as unknown as Target | null;
  if (!m && task.drustvo_id) {
    // reminders and thank-yous continue the društvo's latest incoming thread
    const { data: last } = await supabase
      .from("drustvo_message")
      .select("instantly_email_id,email_account,subject")
      .eq("drustvo_id", task.drustvo_id)
      .eq("direction", "in")
      .not("email_account", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1);
    m = (last?.[0] as Target | undefined) ?? null;
    if (!m) return { ok: false, error: "Za to društvo ni prejšnje e-pošte v Instantly — pošlji ročno (besedilo lahko kopiraš)." };
  }
  if (!m?.instantly_email_id || !m.email_account) return { ok: false, error: "Manjka podatek o izvirni e-pošti; odgovori v Instantly." };

  // claim the task so a double tap cannot send twice
  const { data: claimed } = await supabase
    .from("drustvo_reply_task")
    .update({ decided_by: staff.id, decided_at: new Date().toISOString() })
    .eq("id", taskId)
    .is("decided_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "Odgovor se že pošilja ali je poslan." };

  const subj = subject.trim() || (m.subject?.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject ?? ""}`.trim());
  let sentId: string | null = null;
  try {
    const res = await fetch(`${process.env.INSTANTLY_API_BASE || "https://api.instantly.ai"}/api/v2/emails/reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reply_to_uuid: m.instantly_email_id,
        eaccount: m.email_account,
        subject: subj,
        body: { text: body, html: toHtml(body) },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Instantly ${res.status}: ${text.slice(0, 200)}`);
    try {
      const j = JSON.parse(text) as { id?: string; email_id?: string };
      sentId = j.id ?? j.email_id ?? null;
    } catch {
      // some responses have no body — a 2xx is enough
    }
  } catch (e) {
    await supabase.from("drustvo_reply_task").update({ decided_by: null, decided_at: null, error: e instanceof Error ? e.message.slice(0, 500) : "napaka" }).eq("id", taskId);
    return { ok: false, error: `Pošiljanje ni uspelo: ${e instanceof Error ? e.message : "napaka"}. Poskusi znova ali odgovori v Instantly.` };
  }

  await supabase.from("drustvo_message").insert({
    drustvo_id: task.drustvo_id,
    direction: "out",
    instantly_email_id: sentId ?? `out-${taskId}`,
    email_account: m.email_account,
    subject: subj,
    body_text: body,
    event_type: "reply_sent",
    occurred_at: new Date().toISOString(),
  });
  const { error } = await supabase
    .from("drustvo_reply_task")
    .update({ status: "sent", final_body: body, sent_email_id: sentId, error: null })
    .eq("id", taskId);
  if (error) return { ok: false, error: `Poslano, a stanja ni bilo mogoče shraniti: ${error.message}` };
  refresh();
  return { ok: true };
}

/** Runs the AI again for a task that has no summary yet (key was missing, AI was down). */
export async function retryTriage(taskId: string): Promise<ActionResult> {
  if (!Id.safeParse(taskId).success) return { ok: false, error: "Neveljavna naloga." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Umetna inteligenca še ni nastavljena (ANTHROPIC_API_KEY)." };
  const supabase = await createClient();
  // allow another round of three attempts
  await supabase.from("drustvo_reply_task").update({ attempts: 0 }).eq("id", taskId);
  const r = await triageTask(supabase, taskId);
  refresh();
  return r.status === "awaiting_decision" ? { ok: true } : { ok: false, error: r.error ?? "Povzetek ni uspel." };
}

/** Run the AI reading of a website request again (key was missing, AI was down). */
export async function retryWebParse(id: string): Promise<ActionResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Umetna inteligenca še ni nastavljena (ANTHROPIC_API_KEY)." };
  const supabase = await createClient();
  const r = await parseWebReservation(supabase, id);
  refresh();
  return r.status === "parsed" ? { ok: true } : { ok: false, error: r.error ?? "Branje ni uspelo." };
}
