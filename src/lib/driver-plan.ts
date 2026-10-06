import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { narocila, plural } from "@/lib/format";
import type { PushPayload } from "@/lib/push";

interface RouteRow {
  id: string;
  driver_id: string | null;
  route_stop: {
    status: string;
    order: { order_line: { quantity_ordered: number; product: { name: string } | null }[] } | null;
  }[];
}

interface Shortage {
  product_name: string;
  needed: number | string;
  on_hand: number | string;
}

/**
 * Builds tomorrow's push message per staff member: stop count, what to load,
 * whether stock covers it, and orders still waiting to be put on a route.
 * Takes any Supabase client — the cron passes the service-role one; RLS
 * would hide stock from drivers.
 */
export async function buildDriverPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  forDate: string,
): Promise<Map<string, PushPayload>> {
  const [routesRes, unroutedRes, driversRes] = await Promise.all([
    admin
      .from("route")
      .select(
        "id,driver_id,route_stop(status,order:sales_order(order_line(quantity_ordered,product(name))))",
      )
      .eq("route_date", forDate)
      .not("driver_id", "is", null),
    admin.from("sales_order").select("id,route_stop(id)").eq("delivery_date", forDate).eq("status", "confirmed"),
    admin.from("staff").select("id,full_name").eq("active", true).eq("role", "driver"),
  ]);
  if (routesRes.error) throw routesRes.error;
  if (unroutedRes.error) throw unroutedRes.error;
  if (driversRes.error) throw driversRes.error;

  const routes = (routesRes.data ?? []) as unknown as RouteRow[];
  const unrouted = (unroutedRes.data ?? []).filter(
    (o: { route_stop: unknown[] | null }) => !o.route_stop || o.route_stop.length === 0,
  ).length;

  // Everyone with a route tomorrow, plus every active driver (who still
  // needs to hear that orders are waiting to be loaded).
  const recipients = new Set<string>([
    ...routes.map((r) => r.driver_id!).filter(Boolean),
    ...(driversRes.data ?? []).map((d: { id: string }) => d.id),
  ]);

  const messages = new Map<string, PushPayload>();
  for (const staffId of recipients) {
    const mine = routes.filter((r) => r.driver_id === staffId);
    const parts: string[] = [];

    if (mine.length > 0) {
      const stops = mine.flatMap((r) => r.route_stop).filter((s) => s.status === "pending" || s.status === "arrived");
      const load = new Map<string, number>();
      for (const s of stops) {
        for (const l of s.order?.order_line ?? []) {
          const name = l.product?.name ?? "?";
          load.set(name, (load.get(name) ?? 0) + l.quantity_ordered);
        }
      }
      const items = [...load.entries()].map(([name, n]) => `${n}× ${name}`);
      parts.push(
        `Jutri: ${plural(stops.length, "dostava", "dostavi", "dostave", "dostav")}.` +
          (items.length ? ` Naloži: ${items.slice(0, 6).join(", ")}${items.length > 6 ? ", …" : ""}.` : ""),
      );

      const short: string[] = [];
      for (const r of mine) {
        const { data } = await admin.rpc("route_stock_check", { p_route_id: r.id });
        for (const row of (data ?? []) as Shortage[]) {
          if (Number(row.on_hand) < Number(row.needed)) {
            short.push(`${row.product_name} (potrebno ${row.needed}, na zalogi ${row.on_hand})`);
          }
        }
      }
      parts.push(short.length ? `⚠ Manjka: ${short.join(", ")}.` : "Vse imaš na zalogi.");
    }

    if (unrouted > 0) {
      parts.push(`${narocila(unrouted)} za jutri še ni na nobeni poti.`);
    }

    if (parts.length > 0) {
      messages.set(staffId, {
        title: "Načrt za jutri",
        body: parts.join(" "),
        url: "/dostava",
        tag: `driver-plan-${forDate}`,
      });
    }
  }

  return messages;
}
