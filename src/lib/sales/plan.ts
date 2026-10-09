import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plural } from "@/lib/format";
import type { PushPayload } from "@/lib/push";

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
  const [visitsRes, labelsRes, overdueRes] = await Promise.all([
    admin
      .from("visit")
      .select("staff_id,sort_order,planned_time,venue(name,city),customer(name,city)")
      .eq("planned_for", forDate)
      .is("visited_at", null)
      .order("sort_order"),
    admin.from("day_plan").select("staff_id,label").eq("plan_date", forDate),
    admin
      .from("visit")
      .select("staff_id")
      .eq("outcome", "thinking")
      .lt("follow_up_on", forDate),
  ]);
  if (visitsRes.error) throw visitsRes.error;
  if (labelsRes.error) throw labelsRes.error;
  if (overdueRes.error) throw overdueRes.error;

  const visits = (visitsRes.data ?? []) as unknown as VisitRow[];
  const labels = new Map((labelsRes.data ?? []).map((l: { staff_id: string; label: string | null }) => [l.staff_id, l.label]));
  const overdue = new Map<string, number>();
  for (const o of (overdueRes.data ?? []) as { staff_id: string }[]) overdue.set(o.staff_id, (overdue.get(o.staff_id) ?? 0) + 1);

  const byStaff = new Map<string, VisitRow[]>();
  for (const v of visits) byStaff.set(v.staff_id, [...(byStaff.get(v.staff_id) ?? []), v]);

  const messages = new Map<string, PushPayload>();
  for (const [staffId, stops] of byStaff) {
    const label = labels.get(staffId);
    const first = stops[0].venue ?? stops[0].customer;
    const parts = [
      `Danes: ${plural(stops.length, "obisk", "obiska", "obiski", "obiskov")}${label ? ` (${label})` : ""}.`,
      first ? `Prvi: ${first.name}${first.city ? `, ${first.city}` : ""}.` : "",
    ];
    const late = overdue.get(staffId) ?? 0;
    if (late > 0) parts.push(`${plural(late, "nadaljnji obisk zamuja", "nadaljnja obiska zamujata", "nadaljnji obiski zamujajo", "nadaljnjih obiskov zamuja")}.`);
    messages.set(staffId, {
      title: "Obiski za danes",
      body: parts.filter(Boolean).join(" "),
      url: "/prodaja/danes",
      tag: `sales-plan-${forDate}`,
    });
  }
  return messages;
}
