import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import type { RouteStatus, StopStatus } from "@/lib/types";

/** One product line as the simple Dostava / Tisk tabs show it. */
export interface SimpleLine {
  productId: string;
  productName: string;
  quantity: number;
  delivered: boolean;
}

export interface SimpleStop {
  orderId: string;
  orderNumber: number;
  customerName: string;
  address: string | null;
  city: string | null;
  deliveryNotes: string | null;
  driverNote: string | null;
  status: StopStatus;
  printSentAt: string | null;
  lines: SimpleLine[];
}

export interface SimpleRoute {
  id: string;
  date: string;
  vehicle: string;
  driverName: string | null;
  status: RouteStatus;
  stops: SimpleStop[];
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDay(0);
}

/**
 * Routes around today for the simple tabs: unfinished ones from the last
 * three days (so a forgotten tick-off doesn't vanish) up to three days ahead
 * (the driver gets the plan at 17:00 the evening before).
 */
export async function getSimpleRoutes(): Promise<SimpleRoute[]> {
  if (isDemoMode) return [];

  const today = isoDay(0);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route")
    .select(
      "id,route_date,vehicle,status,driver:staff(full_name),route_stop(sequence,status,order_id,sales_order(order_number,driver_note,print_sent_at,customer(name,address,city,delivery_notes),order_line(product_id,quantity_ordered,quantity_delivered,product(name))))",
    )
    .gte("route_date", isoDay(-3))
    .lte("route_date", isoDay(3))
    .order("route_date")
    .order("vehicle");
  if (error) throw error;

  type Row = {
    id: string;
    route_date: string;
    vehicle: string;
    status: RouteStatus;
    driver: { full_name: string } | null;
    route_stop: {
      sequence: number;
      status: StopStatus;
      order_id: string;
      sales_order: {
        order_number: number;
        driver_note: string | null;
        print_sent_at: string | null;
        customer: { name: string; address: string | null; city: string | null; delivery_notes: string | null } | null;
        order_line: {
          product_id: string;
          quantity_ordered: number;
          quantity_delivered: number | null;
          product: { name: string } | null;
        }[];
      } | null;
    }[];
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => !(r.status === "completed" && r.route_date < today))
    .map((r) => ({
      id: r.id,
      date: r.route_date,
      vehicle: r.vehicle,
      driverName: r.driver?.full_name ?? null,
      status: r.status,
      stops: r.route_stop
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => {
          const so = s.sales_order;
          return {
            orderId: s.order_id,
            orderNumber: so?.order_number ?? 0,
            customerName: so?.customer?.name ?? "—",
            address: so?.customer?.address ?? null,
            city: so?.customer?.city ?? null,
            deliveryNotes: so?.customer?.delivery_notes ?? null,
            driverNote: so?.driver_note ?? null,
            status: s.status,
            printSentAt: so?.print_sent_at ?? null,
            lines: (so?.order_line ?? [])
              .map((l) => ({
                productId: l.product_id,
                productName: l.product?.name ?? "—",
                quantity: l.quantity_ordered,
                delivered: (l.quantity_delivered ?? 0) >= l.quantity_ordered && l.quantity_ordered > 0,
              }))
              .sort((a, b) => a.productName.localeCompare(b.productName, "sl")),
          };
        }),
    }));
}
