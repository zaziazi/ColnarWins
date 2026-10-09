import "server-only";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type {
  BookingStatus, Drustvo, DrustvoMessage, DrustvoStage, DrustvoTier, DrustvaSettings, GroupBooking, ReplyTask,
} from "@/lib/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function mapDrustvo(r: Row): Drustvo {
  return {
    id: r.id as string,
    name: r.name as string,
    type: s(r.type),
    town: s(r.town),
    region: s(r.region),
    tier: r.tier as DrustvoTier,
    stage: r.stage as DrustvoStage,
    email: r.email as string,
    emailAlt: s(r.email_alt),
    phone: s(r.phone),
    contactName: s(r.contact_name),
    website: s(r.website),
    emailCheck: s(r.email_check),
    distanceKm: n(r.distance_km),
    distanceBand: s(r.distance_band),
    activityLevel: s(r.activity_level),
    organizesTrips: s(r.organizes_trips),
    activityNote: s(r.activity_note),
    wave: n(r.wave),
    nextAction: s(r.next_action),
    nextActionOn: s(r.next_action_on),
    notes: s(r.notes),
    sourceUrl: s(r.source_url),
  };
}

/** The whole list (about 1,600 rows) — filtering and search happen in the browser. */
export async function getDrustva(): Promise<Drustvo[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const out: Drustvo[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("drustvo")
      .select(
        "id,name,type,town,region,tier,stage,email,email_alt,phone,contact_name,website,email_check,distance_km,distance_band,activity_level,organizes_trips,activity_note,wave,next_action,next_action_on,notes,source_url",
      )
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r) => mapDrustvo(r as Row)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getDrustvoThread(drustvoId: string): Promise<DrustvoMessage[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drustvo_message")
    .select("id,direction,from_email,subject,body_text,event_type,unibox_url,occurred_at")
    .eq("drustvo_id", drustvoId)
    .order("occurred_at", { ascending: true })
    .limit(60);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id as string,
    direction: m.direction as "in" | "out",
    fromEmail: s(m.from_email),
    subject: s(m.subject),
    body: s(m.body_text),
    eventType: s(m.event_type),
    uniboxUrl: s(m.unibox_url),
    occurredAt: s(m.occurred_at),
  }));
}

/** Open reply tasks: today's urgent first, then newest. */
export async function getOpenReplyTasks(): Promise<ReplyTask[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drustvo_reply_task")
    .select(
      "id,status,intent,recommended_action,summary,reason,urgency,proposed_dates,draft_subject,draft_body,error,created_at,drustvo_id,drustvo(name,type,town,distance_km,phone),drustvo_message(from_email,subject,body_text,unibox_url)",
    )
    .in("status", ["new", "ai_failed", "awaiting_decision", "calling"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const rank = (u: unknown) => (u === "today" ? 0 : u === "this_week" ? 1 : 2);
  return (data ?? [])
    .map((t) => {
      const d = t.drustvo as unknown as Row | null;
      const m = t.drustvo_message as unknown as Row | null;
      return {
        id: t.id as string,
        status: t.status as ReplyTask["status"],
        intent: (t.intent as ReplyTask["intent"]) ?? null,
        recommendedAction: (t.recommended_action as ReplyTask["recommendedAction"]) ?? null,
        summary: s(t.summary),
        reason: s(t.reason),
        urgency: (t.urgency as ReplyTask["urgency"]) ?? null,
        proposedDates: (t.proposed_dates as string[] | null) ?? null,
        draftSubject: s(t.draft_subject),
        draftBody: s(t.draft_body),
        error: s(t.error),
        createdAt: t.created_at as string,
        drustvoId: s(t.drustvo_id),
        drustvoName: d ? s(d.name) : null,
        drustvoType: d ? s(d.type) : null,
        drustvoTown: d ? s(d.town) : null,
        drustvoDistanceKm: d ? n(d.distance_km) : null,
        drustvoPhone: d ? s(d.phone) : null,
        fromEmail: m ? s(m.from_email) : null,
        subject: m ? s(m.subject) : null,
        body: m ? s(m.body_text) : null,
        uniboxUrl: m ? s(m.unibox_url) : null,
      } satisfies ReplyTask;
    })
    .sort((a, b) => rank(a.urgency) - rank(b.urgency) || b.createdAt.localeCompare(a.createdAt));
}

export async function getBookings(from: string): Promise<GroupBooking[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_booking")
    .select("id,drustvo_id,visit_date,arrival_time,people_planned,people_actual,package,price_per_person,food_notes,status,wine_sales_eur,order_id,notes,drustvo(name)")
    .gte("visit_date", from)
    .order("visit_date")
    .order("arrival_time");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id as string,
    drustvoId: b.drustvo_id as string,
    drustvoName: (b.drustvo as unknown as { name: string } | null)?.name ?? "?",
    visitDate: b.visit_date as string,
    arrivalTime: s(b.arrival_time)?.slice(0, 5) ?? null,
    peoplePlanned: n(b.people_planned),
    peopleActual: n(b.people_actual),
    package: s(b.package),
    pricePerPerson: n(b.price_per_person),
    foodNotes: s(b.food_notes),
    status: b.status as BookingStatus,
    wineSalesEur: n(b.wine_sales_eur),
    orderId: s(b.order_id),
    notes: s(b.notes),
  }));
}

export async function getDrustvaSettings(): Promise<DrustvaSettings> {
  const empty: DrustvaSettings = { infoSheet: "", rules: "", maxGroupsPerDay: 1, hostingWeekdays: [1, 2, 3, 4, 5], blackoutDates: [], notifyStaffIds: [] };
  if (isDemoMode) return empty;
  const supabase = await createClient();
  const { data } = await supabase.from("drustvo_settings").select("info_sheet,rules,max_groups_per_day,hosting_weekdays,blackout_dates,notify_staff_ids").eq("id", 1).maybeSingle();
  if (!data) return empty;
  return {
    infoSheet: (data.info_sheet as string) ?? "",
    rules: (data.rules as string) ?? "",
    maxGroupsPerDay: (data.max_groups_per_day as number) ?? 1,
    hostingWeekdays: (data.hosting_weekdays as number[]) ?? [1, 2, 3, 4, 5],
    blackoutDates: (data.blackout_dates as string[]) ?? [],
    notifyStaffIds: (data.notify_staff_ids as string[]) ?? [],
  };
}

export async function getStaffChoices(): Promise<{ id: string; name: string; role: string }[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("id,full_name,role").eq("active", true).order("full_name");
  return (data ?? []).map((x) => ({ id: x.id as string, name: x.full_name as string, role: x.role as string }));
}
