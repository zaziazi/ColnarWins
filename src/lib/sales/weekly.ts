import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plural } from "@/lib/format";
import type { PushPayload } from "@/lib/push";

const DAY = 86_400_000;

/**
 * The Monday reminder for the salesperson: which current customers have not been visited for 30+ days,
 * which marked potential customers are waiting for a first contact, and overdue follow-ups.
 * Returns one message per active "sales" staff member (nothing when there is nothing to do).
 * Takes any Supabase client - the cron passes the service-role one.
 */
export async function buildSalesWeekly(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  today: string,
): Promise<{ messages: Map<string, PushPayload>; stats: Record<string, number> }> {
  const [staffRes, clientsRes, prospectsRes, visitsRes, overdueRes] = await Promise.all([
    admin.from("staff").select("id").eq("role", "sales").eq("active", true),
    admin.from("venue").select("id,name,customer_id").eq("ignored", false).not("customer_id", "is", null),
    admin.from("venue").select("id,name").eq("ignored", false).not("prospect_id", "is", null).is("customer_id", null),
    admin.from("visit").select("venue_id,customer_id,visited_at").not("visited_at", "is", null),
    admin.from("visit").select("staff_id").eq("outcome", "thinking").lt("follow_up_on", today),
  ]);
  for (const r of [staffRes, clientsRes, prospectsRes, visitsRes, overdueRes]) if (r.error) throw r.error;

  const now = new Date(`${today}T12:00:00Z`).getTime();
  const lastByVenue = new Map<string, number>();
  const lastByCustomer = new Map<string, number>();
  for (const v of (visitsRes.data ?? []) as { venue_id: string | null; customer_id: string | null; visited_at: string }[]) {
    const t = new Date(v.visited_at).getTime();
    if (v.venue_id) lastByVenue.set(v.venue_id, Math.max(lastByVenue.get(v.venue_id) ?? 0, t));
    if (v.customer_id) lastByCustomer.set(v.customer_id, Math.max(lastByCustomer.get(v.customer_id) ?? 0, t));
  }

  const staleClients = ((clientsRes.data ?? []) as { id: string; name: string; customer_id: string }[])
    .map((c) => ({ name: c.name, last: Math.max(lastByVenue.get(c.id) ?? 0, lastByCustomer.get(c.customer_id) ?? 0) }))
    .filter((c) => c.last === 0 || now - c.last > 30 * DAY)
    // never visited first, then the longest gap
    .sort((a, b) => a.last - b.last);

  const waitingProspects = ((prospectsRes.data ?? []) as { id: string; name: string }[]).filter((p) => {
    const last = lastByVenue.get(p.id) ?? 0;
    return last === 0 || now - last > 14 * DAY;
  });

  const overdue = new Map<string, number>();
  for (const o of (overdueRes.data ?? []) as { staff_id: string }[]) overdue.set(o.staff_id, (overdue.get(o.staff_id) ?? 0) + 1);

  const messages = new Map<string, PushPayload>();
  for (const s of (staffRes.data ?? []) as { id: string }[]) {
    const late = overdue.get(s.id) ?? 0;
    if (staleClients.length === 0 && waitingProspects.length === 0 && late === 0) continue;
    const parts: string[] = [];
    if (staleClients.length > 0) {
      const sample = staleClients.slice(0, 3).map((c) => c.name).join(", ");
      parts.push(`Brez obiska 30+ dni: ${plural(staleClients.length, "stranka", "stranki", "stranke", "strank")} (npr. ${sample}).`);
    }
    if (waitingProspects.length > 0) {
      parts.push(`Potencialne čakajo na stik: ${waitingProspects.length}.`);
    }
    if (late > 0) {
      parts.push(`Zamujeni nadaljnji obiski: ${late}.`);
    }
    messages.set(s.id, { title: "Teden: kdo čaka na obisk", body: parts.join(" "), url: "/prodaja/teden", tag: `sales-weekly-${today}` });
  }
  return {
    messages,
    stats: { staleClients: staleClients.length, waitingProspects: waitingProspects.length },
  };
}
