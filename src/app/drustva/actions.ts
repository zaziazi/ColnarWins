"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { getDrustvoThread } from "@/lib/drustva/data";
import type { DrustvoMessage } from "@/lib/types";
import { canUseDrustva } from "./constants";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Id = z.string().uuid();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function refresh() {
  revalidatePath("/drustva");
  revalidatePath("/drustva/seznam");
  revalidatePath("/drustva/obiski");
}

async function guard() {
  const staff = await getCurrentStaff();
  return staff && canUseDrustva(staff.role) ? staff : null;
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

// ------------------------------------------------------------------- bookings

const Booking = z.object({
  id: Id.optional(),
  drustvoId: Id,
  visitDate: IsoDate,
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  peoplePlanned: z.number().int().min(0).max(1000).nullable().optional(),
  peopleActual: z.number().int().min(0).max(1000).nullable().optional(),
  package: z.string().max(200).nullable().optional(),
  pricePerPerson: z.number().min(0).max(10000).nullable().optional(),
  foodNotes: z.string().max(1000).nullable().optional(),
  status: z.enum(["tentative", "confirmed", "visited", "cancelled"]),
  wineSalesEur: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Saves a booking and refuses a day that is already full, blacked out, or not a hosting weekday. */
export async function saveBooking(input: z.infer<typeof Booking>): Promise<ActionResult> {
  const parsed = Booking.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const b = parsed.data;
  const supabase = await createClient();

  if (b.status !== "cancelled") {
    const { data: settings } = await supabase.from("drustvo_settings").select("max_groups_per_day,hosting_weekdays,blackout_dates").eq("id", 1).single();
    if (settings) {
      const dow = ((new Date(`${b.visitDate}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
      if (!(settings.hosting_weekdays as number[]).includes(dow)) return { ok: false, error: "Ta dan v tednu ni na seznamu dni za skupine (Nastavitve)." };
      if ((settings.blackout_dates as string[]).includes(b.visitDate)) return { ok: false, error: "Ta datum je blokiran (Nastavitve)." };
      let q = supabase.from("group_booking").select("id", { count: "exact", head: true }).eq("visit_date", b.visitDate).neq("status", "cancelled");
      if (b.id) q = q.neq("id", b.id);
      const { count } = await q;
      if ((count ?? 0) >= (settings.max_groups_per_day as number)) return { ok: false, error: "Ta dan je že poln (največ skupin na dan v Nastavitvah)." };
    }
  }

  const row = {
    drustvo_id: b.drustvoId,
    visit_date: b.visitDate,
    arrival_time: b.arrivalTime ?? null,
    people_planned: b.peoplePlanned ?? null,
    people_actual: b.peopleActual ?? null,
    package: b.package?.trim() || null,
    price_per_person: b.pricePerPerson ?? null,
    food_notes: b.foodNotes?.trim() || null,
    status: b.status,
    wine_sales_eur: b.wineSalesEur ?? null,
    notes: b.notes?.trim() || null,
  };
  const { error } = b.id
    ? await supabase.from("group_booking").update(row).eq("id", b.id)
    : await supabase.from("group_booking").insert({ ...row, created_by: staff.id });
  if (error) return { ok: false, error: error.message };

  // keep the društvo's stage in step with its booking
  const stage = b.status === "visited" ? "visited" : b.status === "confirmed" || b.status === "tentative" ? "booked" : null;
  if (stage) await supabase.from("drustvo").update({ stage }).eq("id", b.drustvoId).not("stage", "in", "(unsubscribed,bounced)");
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
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
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
  revalidatePath("/drustva/nastavitve");
  return { ok: true };
}
