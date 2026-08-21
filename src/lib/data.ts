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
  CurrentStaff,
  Customer,
  Driver,
  DriverRoute,
  OrderForEdit,
  OrderListItem,
  Product,
  ReceivablesAgeingBucket,
  RouteWithStops,
  StandingOrder,
  StockLevel,
  StockMovementEntry,
  UnroutedOrder,
  Vessel,
  WineLot,
  WineLotEvent,
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

  // Open balance comes through customer_balance_summary(), a security
  // definer RPC — not a direct v_open_invoice query. invoice/payment RLS is
  // manager-only, but every office user still needs this aggregate for the
  // overdue-balance warning on the order form, so the RPC exposes just
  // that, deliberately bypassing the tightened RLS for that one purpose.
  const { data: balances } = await supabase.rpc("customer_balance_summary");

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

/**
 * A driver's own route(s) for a date, with full order lines (not just
 * totals) since the delivery-confirmation flow needs per-product quantities
 * to adjust. Unlike getRoutesForDate (the office planning view, correctly
 * unfiltered), this only returns routes assigned to the given driver.
 */
export async function getRouteForDriver(date: string, staffId: string): Promise<DriverRoute[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route")
    .select(
      "id,vehicle,status,route_stop(id,sequence,order_id,status,fail_reason,sales_order(order_number,customer(name,address,city,delivery_notes),order_line(product_id,quantity_ordered,unit_price_net,vat_rate,product(name))))",
    )
    .eq("route_date", date)
    .eq("driver_id", staffId)
    .order("vehicle");

  if (error) throw error;

  type StopRow = {
    id: string;
    sequence: number;
    order_id: string;
    status: "pending" | "arrived" | "completed" | "failed";
    fail_reason: string | null;
    sales_order: {
      order_number: number;
      customer: {
        name: string;
        address: string | null;
        city: string | null;
        delivery_notes: string | null;
      } | null;
      order_line: {
        product_id: string;
        quantity_ordered: number;
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
        const gross = lines.reduce(
          (sum, l) => sum + l.quantity_ordered * Number(l.unit_price_net) * (1 + Number(l.vat_rate)),
          0,
        );
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
          status: s.status,
          failReason: s.fail_reason,
          lines: lines.map((l) => ({
            productId: l.product_id,
            productName: l.product?.name ?? "—",
            quantityOrdered: l.quantity_ordered,
            unitPriceNet: Number(l.unit_price_net),
            vatRate: Number(l.vat_rate),
          })),
        };
      });

    return {
      id: r.id,
      vehicle: r.vehicle,
      status: r.status,
      stops,
    };
  });
}

/** The logged-in staff member, or null if logged out / demo mode. Drives role-based UI. */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  if (isDemoMode) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("id,full_name,role")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) return null;

  return { id: data.id, fullName: data.full_name, role: data.role };
}

/** Receivables bucketed by age, for the manager dashboard. RLS makes this manager-only. */
export async function getReceivablesAgeing(): Promise<ReceivablesAgeingBucket[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_receivables_ageing")
    .select("bucket,invoice_count,amount");

  if (error) throw error;

  return (data ?? []).map((r) => ({
    bucket: r.bucket,
    invoiceCount: r.invoice_count,
    amount: Number(r.amount),
  }));
}

/**
 * Order value for the current calendar month — not "revenue": no real
 * customer has an invoice yet (invoicing-at-delivery, §7.5, isn't built),
 * so this is order totals, the best honest proxy available today.
 */
export async function getMonthlyOrderTotals(): Promise<{ count: number; totalGross: number }> {
  if (isDemoMode) return { count: 0, totalGross: 0 };

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { data, error } = await supabase
    .from("sales_order")
    .select("order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate)")
    .neq("status", "draft")
    .neq("status", "cancelled")
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd);

  if (error) throw error;

  let totalGross = 0;
  for (const o of data ?? []) {
    for (const l of o.order_line ?? []) {
      const q = l.quantity_delivered ?? l.quantity_ordered;
      totalGross += q * Number(l.unit_price_net) * (1 + Number(l.vat_rate));
    }
  }

  return { count: (data ?? []).length, totalGross };
}

/** Bottled stock per product. RLS makes this manager-only. */
export async function getStockLevels(): Promise<StockLevel[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product")
    .select("id,name,case_size,product_stock(quantity_on_hand)")
    .eq("active", true)
    .order("name");

  if (error) throw error;

  return (data ?? []).map((p) => ({
    productId: p.id,
    productName: p.name,
    caseSize: p.case_size,
    quantityOnHand:
      (p.product_stock as unknown as { quantity_on_hand: number } | null)?.quantity_on_hand ?? 0,
  }));
}

/** Recent bottled-stock movements (bottling runs, adjustments), newest first. */
export async function getStockMovements(limit = 15): Promise<StockMovementEntry[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movement")
    .select("id,movement_type,quantity_delta,note,created_at,product(name),staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    productName: (m.product as unknown as { name: string } | null)?.name ?? "—",
    movementType: m.movement_type,
    quantityDelta: m.quantity_delta,
    note: m.note,
    createdByName: (m.staff as unknown as { full_name: string } | null)?.full_name ?? null,
    createdAt: m.created_at,
  }));
}

/** Cellar vessels with whichever wine lot is currently active in them, if any. RLS makes this manager-only. */
export async function getVessels(): Promise<Vessel[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vessel")
    .select("id,name,category,capacity_l,active,wine_lot(id,lot_number,name,volume_l)")
    .eq("wine_lot.status", "active");

  if (error) throw error;

  return (data ?? [])
    .map((v) => {
      const lot = (v.wine_lot as unknown as { id: string; lot_number: string; name: string; volume_l: string }[])[0];
      return {
        id: v.id,
        name: v.name,
        category: v.category,
        capacityL: Number(v.capacity_l),
        active: v.active,
        activeLotId: lot?.id ?? null,
        activeLotNumber: lot?.lot_number ?? null,
        activeLotName: lot?.name ?? null,
        activeLotVolumeL: lot ? Number(lot.volume_l) : null,
      };
    })
    .sort((a, b) => vesselNameCollator.compare(a.name, b.name));
}

/** "Cisterna 2" before "Cisterna 10" — plain string order gets this wrong. */
const vesselNameCollator = new Intl.Collator("sl", { numeric: true, sensitivity: "base" });

/** A single vessel by id, or null if it doesn't exist. RLS makes this manager-only. */
export async function getVessel(id: string): Promise<Vessel | null> {
  if (isDemoMode) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vessel")
    .select("id,name,category,capacity_l,active,wine_lot(id,lot_number,name,volume_l)")
    .eq("id", id)
    .eq("wine_lot.status", "active")
    .single();

  if (error || !data) return null;

  const lot = (data.wine_lot as unknown as { id: string; lot_number: string; name: string; volume_l: string }[])[0];
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    capacityL: Number(data.capacity_l),
    active: data.active,
    activeLotId: lot?.id ?? null,
    activeLotNumber: lot?.lot_number ?? null,
    activeLotName: lot?.name ?? null,
    activeLotVolumeL: lot ? Number(lot.volume_l) : null,
  };
}

/** Active wine lots, newest first. RLS makes this manager-only. */
export async function getActiveLots(): Promise<WineLot[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wine_lot")
    .select("id,lot_number,name,stage,status,vessel_id,volume_l,product_id,vessel(name),product(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapWineLot);
}

/** A single wine lot by id, or null if it doesn't exist. RLS makes this manager-only. */
export async function getWineLot(id: string): Promise<WineLot | null> {
  if (isDemoMode) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wine_lot")
    .select("id,lot_number,name,stage,status,vessel_id,volume_l,product_id,vessel(name),product(name)")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return mapWineLot(data);
}

function mapWineLot(row: {
  id: string;
  lot_number: string;
  name: string;
  stage: WineLot["stage"];
  status: WineLot["status"];
  vessel_id: string | null;
  volume_l: string;
  product_id: string | null;
  vessel: unknown;
  product: unknown;
}): WineLot {
  const vessel = row.vessel as { name: string } | null;
  const product = row.product as { name: string } | null;
  return {
    id: row.id,
    lotNumber: row.lot_number,
    name: row.name,
    stage: row.stage,
    status: row.status,
    vesselId: row.vessel_id,
    vesselName: vessel?.name ?? null,
    volumeL: Number(row.volume_l),
    productId: row.product_id,
    productName: product?.name ?? null,
  };
}

/** Full event history for one wine lot, oldest first — its life story. RLS makes this manager-only. */
export async function getLotEvents(lotId: string): Promise<WineLotEvent[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wine_lot_event")
    .select(
      "id,event_type,volume_l,sugar_gl,ph,so2,malic_acid,tartaric_acid,lactic_acid,total_acid,volatile_acid,co2,alcohol,density,yan,additive_name,amount,unit,note,created_at,edited_at,from_vessel:vessel!wine_lot_event_from_vessel_id_fkey(name),to_vessel:vessel!wine_lot_event_to_vessel_id_fkey(name),related_lot:wine_lot!wine_lot_event_related_lot_id_fkey(lot_number),staff(full_name)",
    )
    .eq("lot_id", lotId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const num = (v: string | null) => (v === null ? null : Number(v));

  return (data ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    fromVesselName: (e.from_vessel as unknown as { name: string } | null)?.name ?? null,
    toVesselName: (e.to_vessel as unknown as { name: string } | null)?.name ?? null,
    volumeL: num(e.volume_l),
    sugarGl: num(e.sugar_gl),
    ph: num(e.ph),
    so2: num(e.so2),
    malicAcid: num(e.malic_acid),
    tartaricAcid: num(e.tartaric_acid),
    lacticAcid: num(e.lactic_acid),
    totalAcid: num(e.total_acid),
    volatileAcid: num(e.volatile_acid),
    co2: num(e.co2),
    alcohol: num(e.alcohol),
    density: num(e.density),
    yan: num(e.yan),
    additiveName: e.additive_name,
    amount: num(e.amount),
    unit: e.unit,
    relatedLotNumber: (e.related_lot as unknown as { lot_number: string } | null)?.lot_number ?? null,
    note: e.note,
    createdByName: (e.staff as unknown as { full_name: string } | null)?.full_name ?? null,
    createdAt: e.created_at,
    editedAt: e.edited_at,
  }));
}
