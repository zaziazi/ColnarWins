import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { narocila } from "@/lib/format";
import type { PushPayload } from "@/lib/push";

interface OrderRow {
  order_line: { product_id: string; quantity_ordered: number; product: { name: string } | null }[];
}

/**
 * Builds tomorrow's push message: how many orders, what to load, whether
 * stock covers it, and a nudge to confirm the day in Dostava (skipped once
 * the driver has confirmed it). Takes any Supabase client - the cron passes
 * the service-role one; RLS would hide stock from drivers. Every active
 * staff member marked "Dostavlja" gets the same message; only those with push on receive it.
 */
export async function buildDriverPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  forDate: string,
): Promise<Map<string, PushPayload>> {
  const [ordersRes, dayRes, staffRes, stockRes] = await Promise.all([
    admin
      .from("sales_order")
      .select("order_line(product_id,quantity_ordered,product(name))")
      .eq("delivery_date", forDate)
      .in("status", ["confirmed", "planned"]),
    admin.from("delivery_day").select("day").eq("day", forDate),
    admin.from("staff").select("id").eq("active", true).eq("delivers", true),
    admin.from("product_stock").select("product_id,quantity_on_hand"),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (dayRes.error) throw dayRes.error;
  if (staffRes.error) throw staffRes.error;
  if (stockRes.error) throw stockRes.error;

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const messages = new Map<string, PushPayload>();
  if (orders.length === 0 || (dayRes.data ?? []).length > 0) return messages;

  const load = new Map<string, { name: string; n: number }>();
  for (const o of orders) {
    for (const l of o.order_line) {
      const cur = load.get(l.product_id) ?? { name: l.product?.name ?? "?", n: 0 };
      cur.n += l.quantity_ordered;
      load.set(l.product_id, cur);
    }
  }
  const onHand = new Map<string, number>(
    (stockRes.data ?? []).map((r: { product_id: string; quantity_on_hand: number }) => [r.product_id, Number(r.quantity_on_hand)]),
  );

  const items = [...load.values()].map((l) => `${l.n}× ${l.name}`);
  const short = [...load.entries()]
    .filter(([id, l]) => (onHand.get(id) ?? 0) < l.n)
    .map(([id, l]) => `${l.name} (potrebno ${l.n}, na zalogi ${onHand.get(id) ?? 0})`);

  const body = [
    `Jutri: ${narocila(orders.length)}.`,
    items.length ? `Naloži: ${items.slice(0, 6).join(", ")}${items.length > 6 ? ", …" : ""}.` : "",
    short.length ? `⚠ Manjka: ${short.join(", ")}.` : "Vse imaš na zalogi.",
    "V Naročilih potrdi dostavo za jutri.",
  ]
    .filter(Boolean)
    .join(" ");

  for (const s of (staffRes.data ?? []) as { id: string }[]) {
    messages.set(s.id, { title: "Dostava za jutri", body, url: "/dostava", tag: `driver-plan-${forDate}` });
  }
  return messages;
}
