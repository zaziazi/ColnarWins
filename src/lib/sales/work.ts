import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineGross } from "@/lib/format";
import { addDays } from "@/lib/sales/dates";
import type { CurrentStaff } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/**
 * Two separate ideas, kept apart on purpose:
 *  - "his customers" = customer.sales_rep_id (who owns the relationship, set by the manager or when he wins a new customer)
 *  - "his deliveries" = sales_order.assigned_driver_id (who drives it, whoever the customer belongs to)
 */

export interface RepChoice {
  repId: string;
  repName: string;
  reps: { id: string; full_name: string }[];
}

/** A salesperson always sees their own numbers; a manager can pick any salesperson. */
export async function resolveRep(db: Db, staff: CurrentStaff, picked?: string): Promise<RepChoice> {
  if (staff.role !== "manager") return { repId: staff.id, repName: staff.fullName, reps: [] };
  const { data } = await db.from("staff").select("id,full_name").eq("role", "sales").eq("active", true).order("full_name");
  const reps = (data ?? []) as { id: string; full_name: string }[];
  const rep = reps.find((r) => r.id === picked) ?? reps[0];
  return { repId: rep?.id ?? staff.id, repName: rep?.full_name ?? staff.fullName, reps };
}

export interface OwnedCustomer {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  lastOrderOn: string | null;
  orders90: number;
  ordersTotal: number;
}

const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The customers that belong to this salesperson, with when they last ordered. */
export async function getRepCustomers(db: Db, repId: string): Promise<OwnedCustomer[]> {
  const { data, error } = await db.from("customer").select("id,name,city,phone").eq("sales_rep_id", repId).eq("active", true).order("name");
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string; city: string | null; phone: string | null }[];
  const stats = new Map<string, { last_order_on: string | null; orders_total: number; orders_90d: number }>();
  for (const part of chunks(rows.map((r) => r.id), 100)) {
    const { data: s } = await db.from("v_customer_orders").select("customer_id,last_order_on,orders_total,orders_90d").in("customer_id", part);
    for (const x of (s ?? []) as { customer_id: string; last_order_on: string | null; orders_total: number; orders_90d: number }[]) stats.set(x.customer_id, x);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    phone: r.phone,
    lastOrderOn: stats.get(r.id)?.last_order_on ?? null,
    orders90: stats.get(r.id)?.orders_90d ?? 0,
    ordersTotal: stats.get(r.id)?.orders_total ?? 0,
  }));
}

export interface RepOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  city: string | null;
  status: "draft" | "confirmed" | "planned" | "delivered" | "invoiced" | "cancelled";
  deliveryDate: string | null;
  totalGross: number;
  lineSummary: string;
  driverName: string | null;
  /** The customer is his. */
  mineCustomer: boolean;
  /** He is the driver. */
  drives: boolean;
  /** He may change it: his customer, or an order he entered himself. */
  canEdit: boolean;
}

const ORDER_SELECT =
  "id,order_number,status,delivery_date,created_by,assigned_driver_id,assigned_driver_name,customer(name,city,sales_rep_id),driver:staff!sales_order_assigned_driver_id_fkey(full_name),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty,product(name))";

interface OrderRow {
  id: string;
  order_number: number;
  status: RepOrder["status"];
  delivery_date: string | null;
  created_by: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  customer: { name: string; city: string | null; sales_rep_id: string | null } | { name: string; city: string | null; sales_rep_id: string | null }[] | null;
  driver: { full_name: string } | { full_name: string }[] | null;
  order_line: (Parameters<typeof lineGross>[0] & { product: { name: string } | { name: string }[] | null })[];
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toRepOrder(o: OrderRow, repId: string): RepOrder {
  const c = one(o.customer);
  const mine = c?.sales_rep_id === repId;
  return {
    id: o.id,
    orderNumber: o.order_number,
    customerName: c?.name ?? "—",
    city: c?.city ?? null,
    status: o.status,
    deliveryDate: o.delivery_date,
    totalGross: o.order_line.reduce((s, l) => s + lineGross(l), 0),
    lineSummary: o.order_line.map((l) => `${l.quantity_delivered ?? l.quantity_ordered}× ${one(l.product)?.name ?? ""}`).join(" · "),
    driverName: one(o.driver)?.full_name ?? o.assigned_driver_name,
    mineCustomer: mine,
    drives: o.assigned_driver_id === repId,
    canEdit: (mine || o.created_by === repId) && (o.status === "draft" || o.status === "confirmed"),
  };
}

const byDay = (a: RepOrder, b: RepOrder) => (a.deliveryDate ?? "9999").localeCompare(b.deliveryDate ?? "9999") || a.orderNumber - b.orderNumber;

/** Open orders plus the last four months of everything else: his customers' orders and the ones he drives. */
export async function getRepOrders(db: Db, repId: string, today: string): Promise<RepOrder[]> {
  const since = addDays(today, -120);
  const recent = `status.in.(draft,confirmed,planned),delivery_date.gte.${since}`;

  const { data: own } = await db.from("customer").select("id").eq("sales_rep_id", repId);
  const ownIds = ((own ?? []) as { id: string }[]).map((c) => c.id);

  const found = new Map<string, OrderRow>();
  const take = (rows: unknown) => {
    for (const r of (rows ?? []) as OrderRow[]) found.set(r.id, r);
  };
  const queries = [
    db.from("sales_order").select(ORDER_SELECT).eq("assigned_driver_id", repId).or(recent).limit(500),
    ...chunks(ownIds, 100).map((part) => db.from("sales_order").select(ORDER_SELECT).in("customer_id", part).or(recent).limit(1000)),
  ];
  for (const res of await Promise.all(queries)) {
    if (res.error) throw res.error;
    take(res.data);
  }

  return [...found.values()].map((o) => toRepOrder(o, repId)).sort(byDay);
}

/** Every order of the winery (open ones plus the last four months), for the "all orders by day" view. Status and value only. */
export async function getAllOrders(db: Db, repId: string, today: string): Promise<RepOrder[]> {
  const since = addDays(today, -120);
  const { data, error } = await db
    .from("sales_order")
    .select(ORDER_SELECT)
    .or(`status.in.(draft,confirmed,planned),delivery_date.gte.${since}`)
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as unknown as OrderRow[]).map((o) => toRepOrder(o, repId)).sort(byDay);
}

export interface RepWork {
  /** Orders of his customers placed in the period (any driver). */
  customerOrders: { count: number; value: number; byStatus: Record<string, number> };
  /** Orders he delivered himself in the period. */
  deliveries: { count: number; value: number; forOwn: number; forOthers: number };
  /** Delivery orders still ahead (confirmed or planned, from today). */
  upcoming: number;
  /** Customers of his with no order for 60+ days (or never). */
  dormant: number;
  customerCount: number;
}

/** The order and delivery side of a salesperson's work, for the statistics page. Status and money only, no payments. */
export async function getRepWork(db: Db, repId: string, from: string, to: string, today: string): Promise<RepWork> {
  const customers = await getRepCustomers(db, repId);
  const ownIds = new Set(customers.map((c) => c.id));

  const customerOrders: RepWork["customerOrders"] = { count: 0, value: 0, byStatus: {} };
  for (const part of chunks([...ownIds], 100)) {
    const { data } = await db
      .from("sales_order")
      .select("status,order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty)")
      .in("customer_id", part)
      .gte("created_at", `${from}T00:00:00+02:00`)
      .lte("created_at", `${to}T23:59:59+02:00`)
      .limit(1000);
    for (const o of (data ?? []) as { status: string; order_line: Parameters<typeof lineGross>[0][] }[]) {
      if (o.status === "cancelled") continue;
      customerOrders.count++;
      customerOrders.byStatus[o.status] = (customerOrders.byStatus[o.status] ?? 0) + 1;
      if (o.status !== "draft") customerOrders.value += o.order_line.reduce((s, l) => s + lineGross(l), 0);
    }
  }

  const deliveries: RepWork["deliveries"] = { count: 0, value: 0, forOwn: 0, forOthers: 0 };
  const { data: done } = await db
    .from("sales_order")
    .select("customer_id,order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty)")
    .eq("assigned_driver_id", repId)
    .in("status", ["delivered", "invoiced"])
    .gte("delivered_at", `${from}T00:00:00+02:00`)
    .lte("delivered_at", `${to}T23:59:59+02:00`)
    .limit(1000);
  for (const o of (done ?? []) as { customer_id: string; order_line: Parameters<typeof lineGross>[0][] }[]) {
    deliveries.count++;
    deliveries.value += o.order_line.reduce((s, l) => s + lineGross(l), 0);
    if (ownIds.has(o.customer_id)) deliveries.forOwn++;
    else deliveries.forOthers++;
  }

  const { count: upcoming } = await db
    .from("sales_order")
    .select("id", { count: "exact", head: true })
    .eq("assigned_driver_id", repId)
    .in("status", ["confirmed", "planned"])
    .gte("delivery_date", today);

  const cutoff = addDays(today, -60);
  const dormant = customers.filter((c) => !c.lastOrderOn || c.lastOrderOn < cutoff).length;

  return { customerOrders, deliveries, upcoming: upcoming ?? 0, dormant, customerCount: customers.length };
}
