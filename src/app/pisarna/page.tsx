import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, FieldLabel } from "@/components/ui/card";
import { getCurrentStaff, getDrivers, getOrders } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { dateShort, eur, narocila } from "@/lib/format";
import { DriverAssign } from "./driver-assign";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  phone: "telefon",
  email: "e-pošta",
  standing: "stalno naročilo",
  field: "teren",
  manual: "ročno",
  webshop: "spletna trgovina",
};

export default async function OrdersPage() {
  const [orders, drivers, staff] = await Promise.all([
    getOrders(),
    getDrivers(),
    getCurrentStaff(),
  ]);
  const drafts = orders.filter((o) => o.status === "draft");
  const open = orders.filter((o) => o.status === "confirmed" || o.status === "planned");
  const done = orders.filter((o) => o.status === "delivered" || o.status === "invoiced");
  const days = groupByDay(open);
  const today = todayIso();

  return (
    <AppShell
      title="Naročila"
      subtitle={`${narocila(drafts.length + open.length)} v obdelavi`}
      who="Marija · pisarna"
      role={staff?.role}
      section="narocila"
    >
      {isDemoMode && (
        <Callout tone="wine" className="mb-4">
          <strong>Demo način.</strong> Supabase še ni nastavljen, zato vidiš vzorčne podatke.
          Izpolni <code className="font-mono text-xs">.env.local</code> in podatki bodo pravi.
        </Callout>
      )}

      <Button asChild size="lg" className="mb-5">
        <Link href="/pisarna/novo">
          <Plus /> Novo naročilo
        </Link>
      </Button>

      {drafts.length > 0 && (
        <>
          <SectionHeading>Čaka na potrditev</SectionHeading>
          <div className="space-y-2.5 mb-6">
            {drafts.map((o) => (
              <OrderCard key={o.id} order={o} drivers={drivers} highlight />
            ))}
          </div>
        </>
      )}

      {days.length === 0 && drafts.length === 0 && (
        <Card className="p-5 text-center mb-6">
          <p className="text-[13px] text-ink-muted">Ni odprtih naročil.</p>
        </Card>
      )}

      {days.map((day) => (
        <div key={day.date ?? "brez"} className="mb-6">
          <DayHeading date={day.date} today={today} count={day.orders.length} />
          <div className="space-y-2.5">
            {day.orders.map((o) => (
              <OrderCard key={o.id} order={o} drivers={drivers} />
            ))}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
            Dostavljena ({done.length})
          </summary>
          <div className="space-y-2.5 mt-2.5">
            {done.map((o) => (
              <OrderCard key={o.id} order={o} drivers={drivers} />
            ))}
          </div>
        </details>
      )}
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

function DayHeading({ date, today, count }: { date: string | null; today: string; count: number }) {
  if (!date) {
    return <SectionHeading>Brez datuma dostave · {count}</SectionHeading>;
  }
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const label = dateShort(new Date(`${date}T12:00:00`));
  const prefix = date === today ? "Danes · " : date === tomorrowIso ? "Jutri · " : "";
  const overdue = date < today;

  return (
    <h2
      className={
        "text-xs font-bold uppercase tracking-[0.06em] mb-2.5 px-0.5 " +
        (overdue ? "text-danger" : "text-ink-subtle")
      }
    >
      {prefix}
      {label}
      {overdue && " · zamuja"} · {count}
    </h2>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
      {children}
    </h2>
  );
}

function OrderCard({
  order,
  drivers,
  highlight,
}: {
  order: Awaited<ReturnType<typeof getOrders>>[number];
  drivers: Awaited<ReturnType<typeof getDrivers>>;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-warn/30 bg-warn-soft/30" : undefined}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px] truncate">{order.customerName}</h3>
            <p className="text-[11.5px] text-ink-subtle mt-0.5">
              #{order.orderNumber} · {SOURCE_LABEL[order.source] ?? order.source}
              {order.deliveryDate && ` · dostava ${dateShort(order.deliveryDate)}`}
              {order.createdByName && ` · vnesel/a ${order.createdByName}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge tone={statusTone[order.status]}>{statusLabel[order.status]}</Badge>
            {(order.status === "draft" || order.status === "confirmed") && (
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-[11.5px] gap-1"
              >
                <Link href={`/pisarna/${order.id}/uredi`}>
                  <Pencil className="size-3" /> Uredi
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2">
          <OrderActions orderId={order.id} status={order.status} />
        </div>

        <p className="text-[12.5px] text-ink-muted mt-2.5 leading-relaxed">{order.lineSummary}</p>
        <div className="flex items-end justify-between mt-1.5">
          <p className="text-[13px] font-semibold tabular">{eur(order.totalGross)}</p>
          <div className="text-right">
            <FieldLabel className="mb-1">Voznik</FieldLabel>
            {order.routedDriverName ? (
              <p className="text-[12.5px] font-medium text-ink-muted h-7 flex items-center justify-end">
                {order.routedDriverName}
              </p>
            ) : (
              <DriverAssign
                orderId={order.id}
                drivers={drivers}
                assignedDriverId={order.assignedDriverId}
              />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
