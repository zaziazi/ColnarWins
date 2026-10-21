import "server-only";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { lineGross } from "@/lib/format";

/** One product line as the simple Dostava / Tisk tabs show it. */
export interface DayLine {
  productId: string;
  productName: string;
  quantity: number;
  delivered: boolean;
  /** Fraction 0..1. */
  discountPct: number;
  /** Of `quantity`, how many go out as a gift. */
  freeQty: number;
}

export interface DayOrder {
  orderId: string;
  orderNumber: number;
  customerName: string;
  address: string | null;
  city: string | null;
  vatId: string | null;
  deliveryNotes: string | null;
  driverNote: string | null;
  /** Who delivers: the picked driver, or a name typed by hand. */
  driverName: string | null;
  /** The picked driver (staff id); null when nobody or only a typed name. */
  driverId: string | null;
  cancelled: boolean;
  /** Created after the driver confirmed this day. */
  addedAfterConfirm: boolean;
  printSentAt: string | null;
  paymentMethod: "trr" | "gotovina" | "kartica" | "drugo";
  /** Gross value of the order (after discounts and gratis): what the driver collects when paid in cash. */
  totalGross: number;
  paidAt: string | null;
  invoiceWaived: boolean;
  /** Content differs from what was last mailed for printing. */
  changedAfterPrint: boolean;
  /** Fingerprint of the current content; stored when the order is mailed. */
  hash: string;
  lines: DayLine[];
}

export interface DeliveryDay {
  date: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
  orders: DayOrder[];
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Local-noon anchor avoids a UTC-rollover off-by-one. */
export function todayIso(): string {
  return isoDay(0);
}

/** What counts as "the same order" for printing: customer, date, note and ordered quantities. */
function fingerprint(o: {
  customer_id: string;
  delivery_date: string | null;
  driver_note: string | null;
  payment_method?: string | null;
  order_line: { product_id: string; quantity_ordered: number; discount_pct?: string | null; free_qty?: number | null }[];
}): string {
  const lines = o.order_line
    .map((l) => `${l.product_id}:${l.quantity_ordered}:${Number(l.discount_pct ?? 0)}:${l.free_qty ?? 0}`)
    .sort()
    .join(",");
  return createHash("sha1")
    .update(`${o.customer_id}|${o.delivery_date}|${o.driver_note ?? ""}|${o.payment_method ?? "trr"}|${lines}`)
    .digest("hex");
}

/**
 * Delivery days around today, derived from confirmed orders (no routes
 * involved): unfinished days from the last two days up to four days ahead.
 * A day is "confirmed" once the driver has confirmed it.
 */
export async function getDeliveryDays(): Promise<DeliveryDay[]> {
  if (isDemoMode) return [];

  const today = isoDay(0);
  const from = isoDay(-2);
  const to = isoDay(4);
  const supabase = await createClient();

  const [ordersRes, daysRes] = await Promise.all([
    supabase
      .from("sales_order")
      .select(
        "id,order_number,status,customer_id,delivery_date,driver_note,payment_method,paid_at,invoice_waived,assigned_driver_id,assigned_driver_name,driver:staff!sales_order_assigned_driver_id_fkey(full_name),confirmed_at,created_at,cancelled_at,print_sent_at,print_hash,print_dismissed_at,customer(name,address,city,vat_id,delivery_notes),order_line(product_id,quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty,product(name))",
      )
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .in("status", ["confirmed", "planned", "delivered", "invoiced", "cancelled"]),
    supabase
      .from("delivery_day")
      .select("day,confirmed_at,confirmer:staff(full_name)")
      .gte("day", from)
      .lte("day", to),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (daysRes.error) throw daysRes.error;

  type OrderRow = {
    id: string;
    order_number: number;
    status: string;
    customer_id: string;
    delivery_date: string;
    driver_note: string | null;
    payment_method: string | null;
    paid_at: string | null;
    invoice_waived: boolean | null;
    assigned_driver_id: string | null;
    assigned_driver_name: string | null;
    driver: { full_name: string } | null;
    confirmed_at: string | null;
    created_at: string;
    cancelled_at: string | null;
    print_sent_at: string | null;
    print_hash: string | null;
    print_dismissed_at: string | null;
    customer: { name: string; address: string | null; city: string | null; vat_id: string | null; delivery_notes: string | null } | null;
    order_line: {
      product_id: string;
      quantity_ordered: number;
      quantity_delivered: number | null;
      unit_price_net: string;
      vat_rate: string;
      discount_pct: string | null;
      free_qty: number | null;
      product: { name: string } | null;
    }[];
  };
  type DayRow = { day: string; confirmed_at: string; confirmer: { full_name: string } | null };

  const confirmedDays = new Map<string, DayRow>();
  for (const d of (daysRes.data ?? []) as unknown as DayRow[]) confirmedDays.set(d.day, d);

  const byDay = new Map<string, DayOrder[]>();
  for (const o of (ordersRes.data ?? []) as unknown as OrderRow[]) {
    const day = confirmedDays.get(o.delivery_date);
    const cancelled = o.status === "cancelled";
    // Cancelled orders the office has cleared from the list stay in the database but not on screen.
    if (cancelled && o.print_dismissed_at) continue;
    // A cancelled order only matters if the driver or the printer already saw it.
    if (cancelled && !(o.print_sent_at || (day && o.cancelled_at && o.cancelled_at > day.confirmed_at))) continue;

    const hash = fingerprint(o);
    const order: DayOrder = {
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer?.name ?? "—",
      address: o.customer?.address ?? null,
      city: o.customer?.city ?? null,
      vatId: o.customer?.vat_id ?? null,
      deliveryNotes: o.customer?.delivery_notes ?? null,
      driverNote: o.driver_note,
      driverName: o.driver?.full_name ?? o.assigned_driver_name ?? null,
      driverId: o.assigned_driver_id,
      cancelled,
      addedAfterConfirm: Boolean(day && (o.confirmed_at ?? o.created_at) > day.confirmed_at),
      printSentAt: o.print_sent_at,
      changedAfterPrint: Boolean(o.print_sent_at && o.print_hash && o.print_hash !== hash),
      hash,
      paymentMethod: ((o.payment_method as DayOrder["paymentMethod"] | null) ?? "trr"),
      totalGross: o.order_line.reduce((sum, l) => sum + lineGross({ ...l, quantity_delivered: null }), 0),
      paidAt: o.paid_at,
      invoiceWaived: Boolean(o.invoice_waived),
      lines: o.order_line
        .map((l) => ({
          productId: l.product_id,
          productName: l.product?.name ?? "—",
          quantity: l.quantity_ordered,
          delivered: (l.quantity_delivered ?? 0) >= l.quantity_ordered && l.quantity_ordered > 0,
          discountPct: Number(l.discount_pct ?? 0),
          freeQty: l.free_qty ?? 0,
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName, "sl")),
    };
    (byDay.get(o.delivery_date) ?? byDay.set(o.delivery_date, []).get(o.delivery_date)!).push(order);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, orders]) => {
      const day = confirmedDays.get(date);
      return {
        date,
        confirmedAt: day?.confirmed_at ?? null,
        confirmedByName: day?.confirmer?.full_name ?? null,
        orders: orders.sort((a, b) => a.customerName.localeCompare(b.customerName, "sl")),
      };
    })
    // Past days drop out once everything on them is delivered (or cancelled).
    .filter(
      (d) =>
        d.date >= today ||
        d.orders.some((o) => !o.cancelled && !(o.lines.length > 0 && o.lines.every((l) => l.delivered))),
    );
}

export interface DayState {
  confirmed: boolean;
  /** Something for this day was already mailed to print. */
  printed: boolean;
}

/** Confirmation / print state per delivery date, for the day headings in Naročila. */
export async function getDayStates(): Promise<Map<string, DayState>> {
  const states = new Map<string, DayState>();
  if (isDemoMode) return states;

  const from = isoDay(-2);
  const supabase = await createClient();
  const [daysRes, printedRes] = await Promise.all([
    supabase.from("delivery_day").select("day").gte("day", from),
    supabase.from("sales_order").select("delivery_date").gte("delivery_date", from).not("print_sent_at", "is", null),
  ]);
  if (daysRes.error) throw daysRes.error;
  if (printedRes.error) throw printedRes.error;

  for (const d of daysRes.data ?? []) states.set(d.day, { confirmed: true, printed: false });
  for (const o of printedRes.data ?? []) {
    const cur = states.get(o.delivery_date) ?? { confirmed: false, printed: false };
    states.set(o.delivery_date, { ...cur, printed: true });
  }
  return states;
}
