import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  demoCustomers,
  demoOrders,
  demoProducts,
  demoStandingOrders,
  isDemoMode,
} from "./demo";
import type { Customer, OrderListItem, Product, StandingOrder } from "./types";

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
      "id,order_number,status,source,delivery_date,created_at,customer(name),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,product(name))",
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
    };
  });
}
