import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { narocila } from "@/lib/format";
import type { PushPayload } from "@/lib/push";

interface OrderRow {
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  order_line: { product_id: string; quantity_ordered: number; product: { name: string } | null }[];
}

const load = (orders: OrderRow[]) => {
  const m = new Map<string, { name: string; n: number }>();
  for (const o of orders) {
    for (const l of o.order_line) {
      const cur = m.get(l.product_id) ?? { name: l.product?.name ?? "?", n: 0 };
      cur.n += l.quantity_ordered;
      m.set(l.product_id, cur);
    }
  }
  return m;
};

/**
 * Builds tomorrow's push per driver: their own orders and what to load, how many orders still have no
 * driver, whether stock covers the whole day, and (until the day is confirmed) a nudge to confirm it.
 * A driver with no orders of their own still hears about orders that nobody has taken.
 * Takes any Supabase client - the cron passes the service-role one; RLS would hide stock from drivers.
 */
export async function buildDriverPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  forDate: string,
): Promise<Map<string, PushPayload>> {
  const [ordersRes, dayRes, staffRes, stockRes] = await Promise.all([
    admin
      .from("sales_order")
      .select("assigned_driver_id,assigned_driver_name,order_line(product_id,quantity_ordered,product(name))")
      .eq("delivery_date", forDate)
      .in("status", ["confirmed", "planned"]),
    admin.from("delivery_day").select("day").eq("day", forDate),
    admin.from("staff").select("id,delivers").eq("active", true),
    admin.from("product_stock").select("product_id,quantity_on_hand"),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (dayRes.error) throw dayRes.error;
  if (staffRes.error) throw staffRes.error;
  if (stockRes.error) throw stockRes.error;

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const messages = new Map<string, PushPayload>();
  if (orders.length === 0) return messages;

  const confirmed = (dayRes.data ?? []).length > 0;
  const onHand = new Map<string, number>(
    (stockRes.data ?? []).map((r: { product_id: string; quantity_on_hand: number }) => [r.product_id, Number(r.quantity_on_hand)]),
  );
  const demand = load(orders);
  const short = [...demand.entries()]
    .filter(([id, l]) => (onHand.get(id) ?? 0) < l.n)
    .map(([id, l]) => `${l.name} (potrebno ${l.n}, na zalogi ${onHand.get(id) ?? 0})`);

  const free = orders.filter((o) => !o.assigned_driver_id && !o.assigned_driver_name);
  const staff = (staffRes.data ?? []) as { id: string; delivers: boolean }[];
  const recipients = staff.filter((s) => s.delivers || orders.some((o) => o.assigned_driver_id === s.id));

  for (const s of recipients) {
    const own = orders.filter((o) => o.assigned_driver_id === s.id);
    if (own.length === 0 && free.length === 0) continue; // nothing for this person

    const parts: string[] = [];
    if (own.length > 0) {
      const items = [...load(own).values()].map((l) => `${l.n}× ${l.name}`);
      parts.push(`Jutri: ${narocila(own.length)}.`);
      if (items.length) parts.push(`Naloži: ${items.slice(0, 6).join(", ")}${items.length > 6 ? ", …" : ""}.`);
    }
    if (free.length > 0) {
      parts.push(`${narocila(free.length)} še nima voznika, v Dostavi jih lahko prevzameš.`);
    }
    parts.push(short.length ? `⚠ Manjka: ${short.join(", ")}.` : "Zaloga zadošča.");
    if (!confirmed) parts.push("V Naročilih potrdi dostavo za jutri.");

    messages.set(s.id, {
      title: own.length > 0 ? "Dostava za jutri" : "Naročila brez voznika",
      body: parts.join(" "),
      url: "/dostava",
      tag: `driver-plan-${forDate}`,
    });
  }
  return messages;
}
