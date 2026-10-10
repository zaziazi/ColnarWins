import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plural } from "@/lib/format";
import { pushToDrustvaStaff } from "./notify";
import { draftFollowUp, triageTask } from "./triage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;
type Row = Record<string, unknown>;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Replies whose AI run never finished (key missing, AI down): try again, three attempts each. */
async function retryStuck(db: Db): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const cutoff = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data } = await db
    .from("drustvo_reply_task")
    .select("id")
    .eq("kind", "reply")
    .in("status", ["new", "ai_failed"])
    .lt("created_at", cutoff)
    .limit(20);
  let n = 0;
  for (const t of (data ?? []) as { id: string }[]) {
    await db.from("drustvo_reply_task").update({ attempts: 0 }).eq("id", t.id);
    const r = await triageTask(db, t.id);
    if (r.status === "awaiting_decision") n++;
  }
  return n;
}

/** "Later" društva whose call date is today get a call task. */
async function createCallTasks(db: Db, today: string): Promise<number> {
  const { data } = await db
    .from("drustvo")
    .select("id,name,next_action")
    .eq("stage", "later")
    .eq("next_action_on", today);
  let n = 0;
  for (const d of (data ?? []) as Row[]) {
    const { error } = await db.from("drustvo_reply_task").insert({
      kind: "call",
      drustvo_id: d.id,
      due_on: today,
      status: "awaiting_decision",
      intent: "later",
      recommended_action: "call",
      urgency: "today",
      summary: `Danes je dan za klic: ${d.name}.`,
      reason: (d.next_action as string | null) ?? "Dogovorjen ponovni klic.",
    });
    if (!error) n++; // a unique violation just means it was already created
  }
  return n;
}

/** A week before a confirmed visit, and the day after it: a task with an AI draft. */
async function createVisitTasks(db: Db, today: string): Promise<{ reminders: number; thanks: number }> {
  let reminders = 0;
  let thanks = 0;

  const { data: upcoming } = await db
    .from("group_booking")
    .select("id,drustvo_id,visit_date,arrival_time,people_planned,package,food_notes,drustvo(name,type,town)")
    .eq("status", "confirmed")
    .not("drustvo_id", "is", null)
    .eq("visit_date", addDays(today, 7));
  for (const b of (upcoming ?? []) as Row[]) {
    const d = b.drustvo as unknown as { name: string; type: string | null; town: string | null } | null;
    if (!d) continue;
    const draft = await draftFollowUp(db, {
      kind: "reminder",
      drustvo: d,
      booking: { visit_date: b.visit_date as string, arrival_time: (b.arrival_time as string | null)?.slice(0, 5) ?? null, people_planned: b.people_planned as number | null, package: b.package as string | null, food_notes: b.food_notes as string | null },
    });
    const { error } = await db.from("drustvo_reply_task").insert({
      kind: "reminder",
      drustvo_id: b.drustvo_id,
      booking_id: b.id,
      due_on: today,
      status: "awaiting_decision",
      recommended_action: "email",
      urgency: "this_week",
      summary: `Opomnik za obisk ${b.visit_date}: ${d.name}.`,
      draft_subject: draft?.subject ?? null,
      draft_body: draft?.body ?? null,
    });
    if (!error) reminders++;
  }

  const { data: done } = await db
    .from("group_booking")
    .select("id,drustvo_id,visit_date,arrival_time,people_planned,package,food_notes,status,drustvo(name,type,town)")
    .in("status", ["confirmed", "visited"])
    .not("drustvo_id", "is", null)
    .eq("visit_date", addDays(today, -1));
  for (const b of (done ?? []) as Row[]) {
    const d = b.drustvo as unknown as { name: string; type: string | null; town: string | null } | null;
    if (!d) continue;
    const draft = await draftFollowUp(db, {
      kind: "thank_you",
      drustvo: d,
      booking: { visit_date: b.visit_date as string, arrival_time: (b.arrival_time as string | null)?.slice(0, 5) ?? null, people_planned: b.people_planned as number | null, package: b.package as string | null, food_notes: b.food_notes as string | null },
    });
    const { error } = await db.from("drustvo_reply_task").insert({
      kind: "thank_you",
      drustvo_id: b.drustvo_id,
      booking_id: b.id,
      due_on: today,
      status: "awaiting_decision",
      recommended_action: "email",
      urgency: "this_week",
      summary: `Zahvala po obisku: ${d.name}.`,
      draft_subject: draft?.subject ?? null,
      draft_body: draft?.body ?? null,
    });
    if (!error) thanks++;
  }
  return { reminders, thanks };
}

export interface DailyResult {
  retried: number;
  callTasks: number;
  reminders: number;
  thanks: number;
  open: number;
  callsToday: number;
  visitsNextWeek: number;
  failedJobs: number;
  push: { sent: number; devices: number };
}

/** The 07:30 job: retries, creates the day's tasks, then one push with the day's picture. */
export async function runDrustvaDaily(db: Db, today: string): Promise<DailyResult> {
  const retried = await retryStuck(db);
  const callTasks = await createCallTasks(db, today);
  const { reminders, thanks } = await createVisitTasks(db, today);

  const [openRes, callsRes, visitsRes, failedRes] = await Promise.all([
    db.from("drustvo_reply_task").select("id", { count: "exact", head: true }).in("status", ["new", "ai_failed", "awaiting_decision", "calling"]).neq("kind", "call"),
    db.from("drustvo_reply_task").select("id", { count: "exact", head: true }).eq("kind", "call").in("status", ["awaiting_decision", "calling"]),
    db.from("group_booking").select("id", { count: "exact", head: true }).in("status", ["confirmed", "tentative"]).gte("visit_date", today).lte("visit_date", addDays(today, 7)),
    db.from("job_run").select("id", { count: "exact", head: true }).eq("ok", false).like("job_name", "drustva%").gte("started_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
  ]);
  const open = openRes.count ?? 0;
  const callsToday = callsRes.count ?? 0;
  const visitsNextWeek = visitsRes.count ?? 0;
  const failedJobs = failedRes.count ?? 0;

  const parts: string[] = [];
  if (open > 0) parts.push(`${plural(open, "odgovor čaka", "odgovora čakata", "odgovori čakajo", "odgovorov čaka")}`);
  if (callsToday > 0) parts.push(`${plural(callsToday, "klic danes", "klica danes", "klici danes", "klicev danes")}`);
  if (visitsNextWeek > 0) parts.push(`${plural(visitsNextWeek, "obisk v 7 dneh", "obiska v 7 dneh", "obiski v 7 dneh", "obiskov v 7 dneh")}`);
  if (failedJobs > 0) parts.push("⚠ včeraj je ena samodejna naloga spodletela");

  let push = { sent: 0, devices: 0 };
  if (parts.length > 0) {
    const r = await pushToDrustvaStaff(db, { title: "Degustacije · jutranji pregled", body: parts.join(" · "), url: "/degustacije", tag: `drustva-daily-${today}` });
    push = { sent: r.sent, devices: r.devices };
  }
  return { retried, callTasks, reminders, thanks, open, callsToday, visitsNextWeek, failedJobs, push };
}
