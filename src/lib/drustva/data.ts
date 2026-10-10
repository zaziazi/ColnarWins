import "server-only";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { mapBooking } from "@/lib/degustacije/map";
import type {
  BookingStatus, DegustacijaPerson, Drustvo, DrustvoMessage, DrustvoStage, DrustvoTier, DrustvaSettings, GroupBooking, ReplyTask, WebReservation,
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
      "id,kind,status,intent,recommended_action,summary,reason,urgency,proposed_dates,draft_subject,draft_body,error,created_at,drustvo_id,drustvo(name,type,town,distance_km,phone),drustvo_message(from_email,subject,body_text,unibox_url)",
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
        kind: ((t.kind as string) ?? "reply") as ReplyTask["kind"],
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

/** Bookings between two dates (inclusive), cancelled ones included so the calendar can offer them. */
export async function getBookingsBetween(from: string, to: string): Promise<GroupBooking[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_booking")
    .select(
      "id,drustvo_id,group_name,source,visit_date,arrival_time,end_time,people_planned,people_actual,wines,food,food_notes,contact_name,contact_phone,contact_email,presenter_id,kitchen_id,presenter_notified_at,kitchen_notified_at,status,wine_sales_eur,notes,web_reservation_id,drustvo(name)",
    )
    .gte("visit_date", from)
    .lte("visit_date", to)
    .order("visit_date")
    .order("arrival_time");
  if (error) throw error;
  return (data ?? []).map((b) => mapBooking(b as Row));
}

export async function getPersons(): Promise<DegustacijaPerson[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("degustacija_person")
    .select("id,name,phone,role,channel,is_default_kitchen,active")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    phone: s(p.phone),
    role: p.role as DegustacijaPerson["role"],
    channel: p.channel as DegustacijaPerson["channel"],
    isDefaultKitchen: Boolean(p.is_default_kitchen),
    active: p.active !== false,
  }));
}

/** Website reservation e-mails still waiting for a decision. */
export async function getOpenWebReservations(): Promise<WebReservation[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("web_reservation")
    .select("id,status,from_email,from_name,subject,body_text,received_at,summary,parsed,reply_draft,error")
    .in("status", ["new", "parsed", "parse_failed"])
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((w) => {
    const p = w.parsed as Row | null;
    return {
      id: w.id as string,
      status: w.status as WebReservation["status"],
      fromEmail: s(w.from_email),
      fromName: s(w.from_name),
      subject: s(w.subject),
      body: s(w.body_text),
      receivedAt: w.received_at as string,
      summary: s(w.summary),
      parsed: p
        ? {
            isReservation: p.is_reservation !== false,
            date: s(p.date),
            time: s(p.time),
            people: n(p.people),
            wines: s(p.wines),
            food: p.food === null || p.food === undefined ? null : Boolean(p.food),
            contactName: s(p.contact_name),
            phone: s(p.phone),
            groupName: s(p.group_name),
            notes: s(p.notes),
          }
        : null,
      replyDraft: s(w.reply_draft),
      error: s(w.error),
    } satisfies WebReservation;
  });
}

/** One društvo's name and contact, to prefill a booking made after a successful call. */
export async function getDrustvoBasics(id: string): Promise<{ id: string; name: string; phone: string | null; email: string | null; contactName: string | null } | null> {
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("drustvo").select("id,name,phone,email,contact_name").eq("id", id).maybeSingle();
  return data ? { id: data.id as string, name: data.name as string, phone: s(data.phone), email: s(data.email), contactName: s(data.contact_name) } : null;
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

/** Wine names offered as quick picks when composing a tasting. */
export async function getTastingWines(): Promise<string[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("product").select("name").eq("active", true).order("name");
  return (data ?? []).map((p) => p.name as string);
}
