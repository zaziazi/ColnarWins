import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  demoCustomers,
  demoOrders,
  demoProducts,
  demoStandingOrders,
  isDemoMode,
} from "./demo";
import type {
  Customer,
  Driver,
  OrderForEdit,
  OrderListItem,
  Product,
  RouteWithStops,
  StandingOrder,
  UnroutedOrder,
} from "./types";

/**
 * The only place the app reads data.
 *
 * Every function falls back to demo data when Supabase is not configured, so
 * the interface is never broken while you are still setting the backend up.
 * Replace the demo branches with `throw` once you go live.
 */

export async function getCustomers(): Promise<Customer[]> {
  if (isDemoMode) return demoCustomers;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer")
    .select(
      "id,name,city,address,delivery_region,delivery_notes,payment_terms_days,credit_hold",
    )
    .eq("active", true)
    .order("name");

  if (error) throw error;

  // Open balance comes from v_open_invoice; joined separately to keep the
  // customer query cheap and cacheable.
  const { data: balances } = await supabase
    .from("v_open_invoice")
    .select("customer_id,balance_open,days_overdue");

  const byCustomer = new Map<string, { balance: number; days: number }>();
  for (const b of balances ?? []) {
    const prev = byCustomer.get(b.customer_id) ?? { balance: 0, days: 0 };
    byCustomer.set(b.customer_id, {
      balance: prev.balance + Number(b.balance_open),
      days: Math.max(prev.days, Number(b.days_overdue)),
    });
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    deliveryRegion: c.delivery_region,
    deliveryNotes: c.delivery_notes,
    paymentTermsDays: c.payment_terms_days,
    openBalance: byCustomer.get(c.id)?.balance ?? 0,
    daysOverdue: byCustomer.get(c.id)?.days ?? 0,
    creditHold: c.credit_hold,
  }));
}

export async function getProducts(): Promise<Product[]> {
  if (isDemoMode) return demoProducts;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product")
    .select("id,name,vintage,volume_l,unit_price_net,vat_rate,case_size")
    .eq("active", true)
    .order("name");

  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    vintage: p.vintage,
    volumeL: p.volume_l,
    unitPriceNet: Number(p.unit_price_net),
    vatRate: Number(p.vat_rate),
    caseSize: p.case_size,
  }));
}

export async function getStandingOrders(): Promise<StandingOrder[]> {
  if (isDemoMode) return demoStandingOrders;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("standing_order")
    .select("customer_id,interval_days,standing_order_line(product_id,quantity)");

  if (error) throw error;

  return (data ?? []).map((s) => ({
    customerId: s.customer_id,
    intervalDays: s.interval_days,
    lastOrderedAt: null,
    lines: (s.standing_order_line ?? []).map((l) => ({
      productId: l.product_id,
      quantity: l.quantity,
    })),
  }));
}

export async function getOrders(): Promise<OrderListItem[]> {
  if (isDemoMode) return demoOrders;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_order")
    .select(
      "id,order_number,status,source,delivery_date,created_at,assigned_driver_id,customer(name),creator:staff!sales_order_created_by_fkey(full_name),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,product(name)),route_stop(route(driver:staff(full_name)))",
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((o) => {
    const lines = o.order_line ?? [];
    const gross = lines.reduce((s, l) => {
      const q = l.quantity_delivered ?? l.quantity_ordered;
      return s + q * Number(l.unit_price_net) * (1 + Number(l.vat_rate));
    }, 0);

    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName:
        (o.customer as unknown as { name: string } | null)?.name ?? "\u2014",
      status: o.status,
      source: o.source,
      deliveryDate: o.delivery_date,
      totalGross: gross,
      lineSummary: lines
        .map(
          (l) =>
            `${l.quantity_delivered ?? l.quantity_ordered}\u00d7 ` +
            ((l.product as unknown as { name: string } | null)?.name ?? ""),
        )
        .join(" \u00b7 "),
      createdAt: o.created_at,
      createdByName: (o.creator as unknown as { full_name: string } | null)?.full_name ?? null,
      assignedDriverId: o.assigned_driver_id,
      routedDriverName:
        (
          o.route_stop as unknown as {
            route: { driver: { full_name: string } | null } | null;
          } | null
        )?.route?.driver?.full_name ?? null,
    };
  });
}

export async function getDrivers(): Promise<Driver[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id,full_name")
    .eq("role", "driver")
    .eq("active", true)
    .order("full_name");

  if (error) throw error;

  return (data ?? []).map((s) => ({ id: s.id, fullName: s.full_name }));
}

/** Only drafts are editable — see the "Uredi" button on /pisarna. */
export async function getOrderForEdit(id: string): Promise<OrderForEdit | null> {
  if (isDemoMode) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_order")
    .select(
      "id,customer_id,status,delivery_date,driver_note,customer(name),order_line(product_id,quantity_ordered)",
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: (data.customer as unknown as { name: string } | null)?.name ?? "—",
    status: data.status,
    deliveryDate: data.delivery_date,
    note: data.driver_note ?? "",
    lines: (data.order_line ?? []).map((l) => ({
      productId: l.product_id,
      quantity: l.quantity_ordered,
    })),
  };
}

/**
 * Confirmed orders for a delivery date that aren't a stop on any route yet.
 * An order can only ever have one route_stop (order_id is unique there), so
 * "not yet routed" just means no matching route_stop row exists.
 */
export async function getUnroutedOrders(date: string): Promise<UnroutedOrder[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();

  const { data: routed, error: routedError } = await supabase
    .from("route_stop")
    .select("order_id");
  if (routedError) throw routedError;
  const routedIds = (routed ?? []).map((r) => r.order_id);

  let query = supabase
    .from("sales_order")
    .select(
      "id,order_number,customer(name,city,delivery_notes),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,product(name))",
    )
    .eq("status", "confirmed")
    .eq("delivery_date", date);

  if (routedIds.length > 0) {
    query = query.not("id", "in", `(${routedIds.join(",")})`);
  }

  const { data, error } = await query.order("order_number");
  if (error) throw error;

  return (data ?? []).map((o) => {
    const lines = o.order_line ?? [];
    const gross = lines.reduce((s, l) => {
      const q = l.quantity_delivered ?? l.quantity_ordered;
      return s + q * Number(l.unit_price_net) * (1 + Number(l.vat_rate));
    }, 0);
    const customer = o.customer as unknown as {
      name: string;
      city: string | null;
      delivery_notes: string | null;
    } | null;

    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: customer?.name ?? "—",
      city: customer?.city ?? null,
      deliveryNotes: customer?.delivery_notes ?? null,
      totalGross: gross,
      lineSummary: lines
        .map(
          (l) =>
            `${l.quantity_delivered ?? l.quantity_ordered}× ` +
            ((l.product as unknown as { name: string } | null)?.name ?? ""),
        )
        .join(" · "),
    };
  });
}

/** Routes for a delivery date, with their stops in sequence and an aggregated loading list. */
export async function getRoutesForDate(date: string): Promise<RouteWithStops[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route")
    .select(
      "id,vehicle,driver_id,status,driver:staff(full_name),route_stop(id,sequence,order_id,sales_order(order_number,customer(name,address,city,delivery_notes),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,product(name))))",
    )
    .eq("route_date", date)
    .order("vehicle");

  if (error) throw error;

  type StopRow = {
    id: string;
    sequence: number;
    order_id: string;
    sales_order: {
      order_number: number;
      customer: {
        name: string;
        address: string | null;
        city: string | null;
        delivery_notes: string | null;
      } | null;
      order_line: {
        quantity_ordered: number;
        quantity_delivered: number | null;
        unit_price_net: string;
        vat_rate: string;
        product: { name: string } | null;
      }[];
    } | null;
  };

  return (data ?? []).map((r) => {
    const stopsRaw = (r.route_stop ?? []) as unknown as StopRow[];

    const stops = stopsRaw
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => {
        const so = s.sales_order;
        const lines = so?.order_line ?? [];
        const gross = lines.reduce((sum, l) => {
          const q = l.quantity_delivered ?? l.quantity_ordered;
          return sum + q * Number(l.unit_price_net) * (1 + Number(l.vat_rate));
        }, 0);
        return {
          id: s.id,
          orderId: s.order_id,
          orderNumber: so?.order_number ?? 0,
          sequence: s.sequence,
          customerName: so?.customer?.name ?? "—",
          address: so?.customer?.address ?? null,
          city: so?.customer?.city ?? null,
          deliveryNotes: so?.customer?.delivery_notes ?? null,
          totalGross: gross,
        };
      });

    const productTotals = new Map<string, number>();
    for (const s of stopsRaw) {
      for (const l of s.sales_order?.order_line ?? []) {
        const name = l.product?.name ?? "—";
        const q = l.quantity_delivered ?? l.quantity_ordered;
        productTotals.set(name, (productTotals.get(name) ?? 0) + q);
      }
    }
    const loadingList = Array.from(productTotals.entries())
      .map(([productName, quantity]) => ({ productName, quantity }))
      .sort((a, b) => a.productName.localeCompare(b.productName));

    return {
      id: r.id,
      vehicle: r.vehicle,
      driverId: r.driver_id,
      driverName: (r.driver as unknown as { full_name: string } | null)?.full_name ?? null,
      status: r.status,
      stops,
      loadingList,
    };
  });
}
