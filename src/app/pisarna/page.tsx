import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getDrivers, getOrders } from "@/lib/data";
import { getDayStates } from "@/lib/delivery-days";
import { isDemoMode } from "@/lib/demo";
import { narocila } from "@/lib/format";
import { OrdersTable } from "./orders-table";
import { PhoneOrders } from "./phone-orders";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, drivers, staff, dayStates] = await Promise.all([
    getOrders(),
    getDrivers(),
    getCurrentStaff(),
    getDayStates(),
  ]);
  const drafts = orders.filter((o) => o.status === "draft");
  const open = orders.filter((o) => o.status === "confirmed" || o.status === "planned");
  const done = orders.filter((o) => o.status === "delivered" || o.status === "invoiced");
  if (staff?.role === "sales") redirect("/dostava"); // Prodaja users only use Dostava here
  const days = groupByDay(open);
  const today = todayIso();

  return (
    <AppShell
      title="Naročila"
      subtitle={`${narocila(drafts.length + open.length)} v obdelavi`}
      who={staff?.fullName ?? "Prijava potrebna"}
      role={staff?.role} seesAc={staff?.seesAc} isAdmin={staff?.isAdmin} denied={staff?.denied}
      section="narocila"
      wide
    >
      {isDemoMode && (
        <Callout tone="wine" className="mb-4">
          <strong>Demo način.</strong> Supabase še ni nastavljen, zato vidiš vzorčne podatke.
          Izpolni <code className="font-mono text-xs">.env.local</code> in podatki bodo pravi.
        </Callout>
      )}

      <Button asChild size="lg" className="mb-5 min-[900px]:w-auto min-[900px]:px-6 min-[900px]:h-11">
        <Link href="/pisarna/novo">
          <Plus /> Novo naročilo
        </Link>
      </Button>

      {/* Laptop: one table with filters and bulk confirm. Phones keep the day-by-day cards below. */}
      <div className="hidden min-[900px]:block">
        <OrdersTable orders={orders.filter((o) => o.status !== "cancelled")} />
      </div>
      <div className="min-[900px]:hidden">
        <PhoneOrders
          drafts={drafts}
          days={days.map((d) => ({
            date: d.date,
            orders: d.orders,
            state: dayStates.get(d.date ?? "") ?? null,
            noDriver: d.orders.filter((o) => !o.assignedDriverId && !o.assignedDriverName && !o.routedDriverName).length,
          }))}
          done={done}
          drivers={drivers}
          today={today}
        />
      </div>
    </AppShell>
  );
}

/** Local-noon anchor avoids a UTC-rollover off-by-one — same technique the order form uses. */
function todayIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

type Order = Awaited<ReturnType<typeof getOrders>>[number];

/** Orders arrive sorted by delivery date ascending; this just buckets consecutive days. */
function groupByDay(orders: Order[]): { date: string | null; orders: Order[] }[] {
  const out: { date: string | null; orders: Order[] }[] = [];
  for (const o of orders) {
    const last = out[out.length - 1];
    if (last && last.date === o.deliveryDate) last.orders.push(o);
    else out.push({ date: o.deliveryDate, orders: [o] });
  }
  return out;
}
