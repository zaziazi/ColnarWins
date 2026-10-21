import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowUp } from "@/lib/types";

type Row = Record<string, unknown>;

/**
 * "Razmislili bodo" visits whose follow-up date has come (or is within the window) and which have not been
 * re-planned or visited again since. One salesperson, or all of them when `staffId` is null (the morning job).
 * Takes any Supabase client: the app passes the signed-in one, the cron the service-role one.
 */
export async function getFollowUpsWith(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  staffId: string | null,
  until: string,
): Promise<(FollowUp & { staffId: string })[]> {
  let query = supabase
    .from("visit")
    .select("id,staff_id,venue_id,customer_id,visited_at,follow_up_on,note,venue(name,city),customer(name,city)")
    .not("visited_at", "is", null)
    .eq("outcome", "thinking")
    .not("follow_up_on", "is", null)
    .lte("follow_up_on", until);
  if (staffId) query = query.eq("staff_id", staffId);
  const { data, error } = await query.order("follow_up_on").limit(200);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const venueIds = rows.map((r) => r.venue_id).filter(Boolean) as string[];
  const customerIds = rows.map((r) => r.customer_id).filter(Boolean) as string[];
  const since = rows.reduce((m, r) => ((r.visited_at as string) < m ? (r.visited_at as string) : m), rows[0].visited_at as string);

  // Anything planned or visited for the same target after the "thinking" visit supersedes it.
  const later = new Map<string, string>();
  const keyOf = (v: string | null, c: string | null) => (v ? `v:${v}` : c ? `c:${c}` : "");
  const queries = [];
  if (venueIds.length) queries.push(supabase.from("visit").select("id,venue_id,customer_id,visited_at,created_at").in("venue_id", venueIds).gte("created_at", since));
  if (customerIds.length) queries.push(supabase.from("visit").select("id,venue_id,customer_id,visited_at,created_at").in("customer_id", customerIds).gte("created_at", since));
  for (const res of await Promise.all(queries)) {
    for (const r of res.data ?? []) {
      const k = keyOf(r.venue_id as string | null, r.customer_id as string | null);
      const prev = later.get(k);
      if (!prev || (r.created_at as string) > prev) later.set(k, r.created_at as string);
      const k2 = r.venue_id && r.customer_id ? `c:${r.customer_id}` : null;
      if (k2) {
        const p2 = later.get(k2);
        if (!p2 || (r.created_at as string) > p2) later.set(k2, r.created_at as string);
      }
    }
  }
  const seen = new Set<string>();
  const out: (FollowUp & { staffId: string })[] = [];
  for (const r of rows) {
    const k = keyOf(r.venue_id as string | null, r.customer_id as string | null);
    const newer = [...later.entries()].some(
      ([lk, at]) => (lk === k || (r.customer_id && lk === `c:${r.customer_id}`)) && at > (r.visited_at as string),
    );
    if (newer || seen.has(k)) continue;
    seen.add(k);
    const t = ((r.venue ?? r.customer) as unknown as Row | null) ?? {};
    out.push({
      staffId: r.staff_id as string,
      visitId: r.id as string,
      venueId: r.venue_id as string | null,
      customerId: r.customer_id as string | null,
      name: (t.name as string) ?? "?",
      city: (t.city as string | null) ?? null,
      followUpOn: r.follow_up_on as string,
      note: r.note as string | null,
    });
  }
  return out;
}
