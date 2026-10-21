import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getFollowUpsWith } from "@/lib/sales/followups";
import type { CarStockRow, FollowUp, PlannedVisit, RepMovement, SalesProduct, VenueKind, VisitOutcome } from "@/lib/types";

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Visits (planned or done) of one salesperson between two dates, in plan order. */
export async function getPlannedVisits(staffId: string, from: string, to: string): Promise<PlannedVisit[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visit")
    .select(
      "id,planned_for,planned_time,sort_order,venue_id,customer_id,visited_at,outcome,contact_name,note,follow_up_on,announced_at,announced_via,offer_token,offer_open_count,order_id,venue(name,kind,address,city,post_code,phone,email,lat,lng,vat_id,legal_name,contact_name,customer_id),customer(name,address,city,post_code,phone,email,lat,lng,vat_id,contact_name)",
    )
    .eq("staff_id", staffId)
    .gte("planned_for", from)
    .lte("planned_for", to)
    .order("planned_for")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;

  const visits = (data ?? []).map((r) => {
    const v = r.venue as unknown as Row | null;
    const c = r.customer as unknown as Row | null;
    const src = v ?? c ?? {};
    return {
      id: r.id as string,
      plannedFor: r.planned_for as string,
      plannedTime: (r.planned_time as string | null)?.slice(0, 5) ?? null,
      sortOrder: r.sort_order as number,
      venueId: r.venue_id as string | null,
      customerId: (r.customer_id as string | null) ?? (v?.customer_id as string | null) ?? null,
      isCustomer: Boolean(r.customer_id ?? v?.customer_id),
      name: (src.name as string) ?? "?",
      kind: (v?.kind as VenueKind | undefined) ?? null,
      address: (src.address as string | null) ?? null,
      city: (src.city as string | null) ?? null,
      postCode: (src.post_code as string | null) ?? null,
      phone: (src.phone as string | null) ?? null,
      email: (src.email as string | null) ?? null,
      lat: num(src.lat),
      lng: num(src.lng),
      vatId: (src.vat_id as string | null) ?? null,
      legalName: (v?.legal_name as string | null) ?? null,
      knownContact: (src.contact_name as string | null) ?? null,
      visitedAt: r.visited_at as string | null,
      outcome: r.outcome as VisitOutcome | null,
      contactName: r.contact_name as string | null,
      note: r.note as string | null,
      followUpOn: r.follow_up_on as string | null,
      announcedAt: r.announced_at as string | null,
      announcedVia: r.announced_via as string | null,
      offerToken: r.offer_token as string,
      offerOpenCount: r.offer_open_count as number,
      orderId: r.order_id as string | null,
    };
  });
  return sortVisits(visits);
}

/** Plan order: by date, then by time of day (stops without a time after the timed ones, in manual order). */
export function sortVisits<T extends { plannedFor: string; plannedTime: string | null; sortOrder: number }>(visits: T[]): T[] {
  return [...visits].sort(
    (a, b) =>
      a.plannedFor.localeCompare(b.plannedFor) ||
      (a.plannedTime ?? "99:99").localeCompare(b.plannedTime ?? "99:99") ||
      a.sortOrder - b.sortOrder,
  );
}

export async function getDayLabels(staffId: string, from: string, to: string): Promise<Record<string, string>> {
  if (isDemoMode) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("day_plan")
    .select("plan_date,label")
    .eq("staff_id", staffId)
    .gte("plan_date", from)
    .lte("plan_date", to);
  if (error) throw error;
  return Object.fromEntries((data ?? []).filter((d) => d.label).map((d) => [d.plan_date as string, d.label as string]));
}

/**
 * "Razmislili bodo" visits whose follow-up date has come (or is within the
 * window) and which have not been re-planned or visited again since.
 */
export async function getFollowUps(staffId: string, until: string): Promise<FollowUp[]> {
  if (isDemoMode) return [];
  return getFollowUpsWith(await createClient(), staffId, until);
}

export async function getCarStock(staffId?: string): Promise<CarStockRow[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_stock_overview", { p_staff: staffId ?? null });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    productId: r.product_id as string,
    name: r.name as string,
    vintage: num(r.vintage),
    volumeL: num(r.volume_l),
    caseSize: num(r.case_size),
    cellarQty: Number(r.cellar_qty),
    inCar: Number(r.in_car),
  }));
}

export async function getRepMovements(staffId: string, limit = 40): Promise<RepMovement[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rep_stock_movement")
    .select("id,kind,quantity,created_at,product(name),visit(venue(name),customer(name))")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const visit = r.visit as unknown as { venue: { name: string } | null; customer: { name: string } | null } | null;
    return {
      id: r.id as string,
      kind: r.kind as RepMovement["kind"],
      quantity: Number(r.quantity),
      productName: (r.product as unknown as { name: string } | null)?.name ?? "?",
      venueName: visit?.venue?.name ?? visit?.customer?.name ?? null,
      createdAt: r.created_at as string,
    };
  });
}

export async function getSalesProducts(): Promise<SalesProduct[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product")
    .select("id,name,vintage,volume_l,case_size,unit_price_net,vat_rate")
    .eq("active", true)
    .gt("unit_price_net", 0)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    vintage: num(p.vintage),
    volumeL: num(p.volume_l),
    caseSize: num(p.case_size),
    price: Number(p.unit_price_net),
    vat: Number(p.vat_rate),
  }));
}

export async function getCalendarToken(staffId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("calendar_token").eq("id", staffId).single();
  return (data?.calendar_token as string | null) ?? null;
}

/** The salesperson's phone, shown to venues on the offer page; absent until the office fills it in. */
export async function getStaffPhone(staffId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("phone").eq("id", staffId).single();
  return (data?.phone as string | null) ?? null;
}
