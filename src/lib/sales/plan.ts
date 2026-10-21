import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plural } from "@/lib/format";
import type { PushPayload } from "@/lib/push";
import { getFollowUpsWith } from "@/lib/sales/followups";

interface VisitRow {
  staff_id: string;
  sort_order: number;
  planned_time: string | null;
  venue: { name: string; city: string | null } | null;
  customer: { name: string; city: string | null } | null;
}

/**
 * Builds the morning push per salesperson: how many stops today, where, the
 * first one, and how many follow-ups are overdue. Takes any Supabase client —
 * the cron passes the service-role one.
 */
export async function buildSalesPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  forDate: string,
): Promise<Map<string, PushPayload>> {
  const [visitsRes, labelsRes, followUps] = await Promise.all([
    admin
      .from("visit")
      .select("staff_id,sort_order,planned_time,venue(name,city),customer(name,city)")
      .eq("planned_for", forDate)
      .is("visited_at", null)
      .order("sort_order"),
    admin.from("day_plan").select("staff_id,label").eq("plan_date", forDate),
    // "razmislili bodo" visits that are due today or late and were not followed up since
    getFollowUpsWith(admin, null, forDate),
  ]);
  if (visitsRes.error) throw visitsRes.error;
  if (labelsRes.error) throw labelsRes.error;

  const visits = (visitsRes.data ?? []) as unknown as VisitRow[];
  const labels = new Map((labelsRes.data ?? []).map((l: { staff_id: string; label: string | null }) => [l.staff_id, l.label]));
  const dueToday = new Map<string, string[]>();
  const overdue = new Map<string, number>();
  for (const f of followUps) {
    if (f.followUpOn === forDate) dueToday.set(f.staffId, [...(dueToday.get(f.staffId) ?? []), f.name]);
    else overdue.set(f.staffId, (overdue.get(f.staffId) ?? 0) + 1);
  }

  const byStaff = new Map<string, VisitRow[]>();
  for (const v of visits) byStaff.set(v.staff_id, [...(byStaff.get(v.staff_id) ?? []), v]);

  const messages = new Map<string, PushPayload>();
  const staffIds = new Set<string>([...byStaff.keys(), ...dueToday.keys(), ...overdue.keys()]);
  for (const staffId of staffIds) {
    const stops = byStaff.get(staffId) ?? [];
    const label = labels.get(staffId);
    const parts: string[] = [];
    if (stops.length > 0) {
      const first = stops[0].venue ?? stops[0].customer;
      parts.push(`Danes: ${plural(stops.length, "obisk", "obiska", "obiski", "obiskov")}${label ? ` (${label})` : ""}.`);
      if (first) parts.push(`Prvi: ${first.name}${first.city ? `, ${first.city}` : ""}.`);
    }
    const today = dueToday.get(staffId) ?? [];
    if (today.length > 0) {
      const names = today.slice(0, 3).join(", ");
      parts.push(`Danes pokliči ali obišči (so razmislili): ${names}${today.length > 3 ? ` in še ${today.length - 3}` : ""}.`);
    }
    const late = overdue.get(staffId) ?? 0;
    if (late > 0) parts.push(`${plural(late, "nadaljnji obisk zamuja", "nadaljnja obiska zamujata", "nadaljnji obiski zamujajo", "nadaljnjih obiskov zamuja")}.`);
    if (parts.length === 0) continue;
    messages.set(staffId, {
      title: stops.length > 0 ? "Obiski za danes" : "Nadaljnji obiski",
      body: parts.join(" "),
      url: stops.length > 0 ? "/prodaja/danes" : "/prodaja/statistika",
      tag: `sales-plan-${forDate}`,
    });
  }
  return messages;
}
