import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineGross } from "@/lib/format";
import { addDays, monthStart, weekStart } from "@/lib/sales/dates";
import { getFollowUpsWith } from "@/lib/sales/followups";
import type { FollowUp, VisitOutcome } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type StatsRange = "week" | "month" | "90";

export interface PeriodNumbers {
  visits: number;
  met: number; // visits where somebody was there
  ordered: number;
  thinking: number;
  noInterest: number;
  notThere: number;
  orderValue: number;
  sampleBottles: number;
}

export interface ClosedDeal {
  visitId: string;
  name: string;
  city: string | null;
  at: string;
  value: number;
}

export interface SalesStats {
  from: string;
  to: string;
  current: PeriodNumbers;
  previous: PeriodNumbers;
  closed: ClosedDeal[];
  notClosed: { visitId: string; name: string; city: string | null; at: string; outcome: VisitOutcome; note: string | null }[];
  followUps: (FollowUp & { planned: boolean })[];
  /** Visits per day of the current period (for the little bar strip). */
  perDay: { date: string; count: number; ordered: number }[];
}

const empty = (): PeriodNumbers => ({ visits: 0, met: 0, ordered: 0, thinking: 0, noInterest: 0, notThere: 0, orderValue: 0, sampleBottles: 0 });

/** The period (inclusive dates) and the same-length period right before it. */
export function rangeDates(range: StatsRange, today: string): { from: string; to: string; prevFrom: string; prevTo: string } {
  let from: string;
  let to = today;
  if (range === "week") from = weekStart(today);
  else if (range === "month") from = monthStart(today);
  else from = addDays(today, -89);
  const days = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from, to, prevFrom, prevTo };
}

interface VisitRow {
  id: string;
  staff_id: string;
  visited_at: string;
  outcome: VisitOutcome;
  note: string | null;
  order_id: string | null;
  venue_id: string | null;
  customer_id: string | null;
  venue: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
  customer: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date(iso));

/** What one salesperson did, what it brought in, and what is still open. */
export async function getSalesStats(db: Db, staffId: string, range: StatsRange, today: string): Promise<SalesStats> {
  const r = rangeDates(range, today);
  const { data: visits, error } = await db
    .from("visit")
    .select("id,staff_id,visited_at,outcome,note,order_id,venue_id,customer_id,venue(name,city),customer(name,city)")
    .eq("staff_id", staffId)
    .not("visited_at", "is", null)
    .gte("visited_at", `${r.prevFrom}T00:00:00+02:00`)
    .lte("visited_at", `${r.to}T23:59:59+02:00`)
    .order("visited_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const rows = ((visits ?? []) as unknown as VisitRow[]).filter((v) => v.outcome);

  // order values for the visits that produced an order
  const orderIds = [...new Set(rows.map((v) => v.order_id).filter(Boolean) as string[])];
  const value = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += 150) {
    const { data } = await db
      .from("sales_order")
      .select("id,status,order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty)")
      .in("id", orderIds.slice(i, i + 150));
    for (const o of (data ?? []) as { id: string; status: string; order_line: Parameters<typeof lineGross>[0][] }[]) {
      if (o.status === "cancelled") continue;
      value.set(o.id, o.order_line.reduce((s, l) => s + lineGross(l), 0));
    }
  }

  const cur = empty();
  const prev = empty();
  const closed: ClosedDeal[] = [];
  const notClosed: SalesStats["notClosed"] = [];
  const perDayMap = new Map<string, { count: number; ordered: number }>();
  for (const v of rows) {
    const d = dayOf(v.visited_at);
    const bucket = d >= r.from && d <= r.to ? cur : d >= r.prevFrom && d <= r.prevTo ? prev : null;
    if (!bucket) continue;
    bucket.visits++;
    if (v.outcome !== "not_there") bucket.met++;
    if (v.outcome === "ordered") {
      bucket.ordered++;
      bucket.orderValue += value.get(v.order_id ?? "") ?? 0;
    } else if (v.outcome === "thinking") bucket.thinking++;
    else if (v.outcome === "no_interest") bucket.noInterest++;
    else bucket.notThere++;

    if (bucket === cur) {
      const t = one(v.venue) ?? one(v.customer);
      const pd = perDayMap.get(d) ?? { count: 0, ordered: 0 };
      pd.count++;
      if (v.outcome === "ordered") pd.ordered++;
      perDayMap.set(d, pd);
      if (v.outcome === "ordered") closed.push({ visitId: v.id, name: t?.name ?? "?", city: t?.city ?? null, at: v.visited_at, value: value.get(v.order_id ?? "") ?? 0 });
      else if (v.outcome === "no_interest") notClosed.push({ visitId: v.id, name: t?.name ?? "?", city: t?.city ?? null, at: v.visited_at, outcome: v.outcome, note: v.note });
    }
  }

  // samples given in the period (bottles, in quarters)
  const { data: moves } = await db
    .from("rep_stock_movement")
    .select("quantity,created_at")
    .eq("staff_id", staffId)
    .eq("kind", "given")
    .gte("created_at", `${r.prevFrom}T00:00:00+02:00`)
    .lte("created_at", `${r.to}T23:59:59+02:00`);
  for (const m of (moves ?? []) as { quantity: number | string; created_at: string }[]) {
    const d = dayOf(m.created_at);
    if (d >= r.from && d <= r.to) cur.sampleBottles += Number(m.quantity);
    else if (d >= r.prevFrom && d <= r.prevTo) prev.sampleBottles += Number(m.quantity);
  }

  // everything still open: "razmislili bodo" with a follow-up date, due or not yet due
  const open = await getFollowUpsWith(db, staffId, addDays(today, 60));
  const planned = new Set<string>();
  if (open.length > 0) {
    const vids = open.map((f) => f.venueId).filter(Boolean) as string[];
    const cids = open.map((f) => f.customerId).filter(Boolean) as string[];
    const qs = [];
    if (vids.length) qs.push(db.from("visit").select("venue_id,customer_id").eq("staff_id", staffId).is("visited_at", null).gte("planned_for", today).in("venue_id", vids));
    if (cids.length) qs.push(db.from("visit").select("venue_id,customer_id").eq("staff_id", staffId).is("visited_at", null).gte("planned_for", today).in("customer_id", cids));
    for (const res of await Promise.all(qs)) for (const p of (res.data ?? []) as { venue_id: string | null; customer_id: string | null }[]) planned.add(p.venue_id ? `v:${p.venue_id}` : `c:${p.customer_id}`);
  }

  const perDay: SalesStats["perDay"] = [];
  for (let d = r.from; d <= r.to && perDay.length < 92; d = addDays(d, 1)) perDay.push({ date: d, count: perDayMap.get(d)?.count ?? 0, ordered: perDayMap.get(d)?.ordered ?? 0 });

  return {
    from: r.from,
    to: r.to,
    current: cur,
    previous: prev,
    closed: closed.sort((a, b) => b.at.localeCompare(a.at)),
    notClosed,
    followUps: open.map((f) => ({ ...f, planned: planned.has(f.venueId ? `v:${f.venueId}` : `c:${f.customerId}`) })),
    perDay,
  };
}
