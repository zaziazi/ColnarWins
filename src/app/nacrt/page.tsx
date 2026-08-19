import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getDrivers, getRoutesForDate, getUnroutedOrders } from "@/lib/data";
import { eur, dateSl } from "@/lib/format";
import { AddToRoute } from "./add-to-route";
import { RouteCreator } from "./route-creator";
import { StopControls } from "./stop-controls";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  office: "pisarna",
  driver: "voznik",
  sales: "prodaja",
  manager: "vodstvo",
};

const ROUTE_STATUS_LABEL: Record<string, string> = {
  planned: "Načrtovano",
  in_progress: "V teku",
  completed: "Zaključeno",
};

const ROUTE_STATUS_TONE: Record<string, "neutral" | "good" | "warn"> = {
  planned: "neutral",
  in_progress: "warn",
  completed: "good",
};

/** Skips Sunday, same rule the order form uses for delivery dates. */
function nextDate(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DeliveryPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;

  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const defaultDate = toDateStr(nextDate(base));
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : defaultDate;

  const selected = new Date(`${date}T12:00:00`);
  const prevDate = toDateStr(new Date(selected.getTime() - 86400000));
  const nextDateStr = toDateStr(new Date(selected.getTime() + 86400000));

  const [routes, unrouted, drivers, staff] = await Promise.all([
    getRoutesForDate(date),
    getUnroutedOrders(date),
    getDrivers(),
    getCurrentStaff(),
  ]);

  return (
    <AppShell
      title="Načrt dostave"
      subtitle="Poti in nakladalni listi"
      who={staff ? `${staff.fullName} · ${ROLE_LABEL[staff.role] ?? staff.role}` : "Prijava potrebna"}
      role={staff?.role}
      section="narocila"
    >
      {/* -------------------------------------------------- date switcher */}
      <div className="flex items-center justify-between mb-5">
        <Link
          href={`/nacrt?date=${prevDate}`}
          className="h-10 w-10 grid place-items-center rounded-[var(--radius-control)]
                     border border-line bg-surface hover:bg-surface-muted transition-colors"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="text-sm font-semibold capitalize">{dateSl(date)}</span>
        <Link
          href={`/nacrt?date=${nextDateStr}`}
          className="h-10 w-10 grid place-items-center rounded-[var(--radius-control)]
                     border border-line bg-surface hover:bg-surface-muted transition-colors"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {/* ------------------------------------------------------------ routes */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">Poti</h2>
        <RouteCreator date={date} drivers={drivers} />
      </div>

      {routes.length === 0 && (
        <Card className="p-5 text-center mb-6">
          <p className="text-[13px] text-ink-muted">Za ta dan še ni ustvarjenih poti.</p>
        </Card>
      )}

      <div className="space-y-2.5 mb-6">
        {routes.map((route) => (
          <Card key={route.id} className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-[15px] truncate">{route.vehicle}</h3>
                <p className="text-[11.5px] text-ink-subtle mt-0.5">
                  {route.driverName ?? "brez voznika"}
                </p>
              </div>
              <Badge tone={ROUTE_STATUS_TONE[route.status]}>
                {ROUTE_STATUS_LABEL[route.status] ?? route.status}
              </Badge>
            </div>

            {route.stops.length === 0 ? (
              <p className="text-[12.5px] text-ink-subtle mt-3">
                Še brez postankov — dodaj naročila spodaj.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {route.stops.map((stop, i) => (
                  <div
                    key={stop.id}
                    className="flex items-center gap-2 py-2 border-t border-line first:border-t-0"
                  >
                    <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold truncate">{stop.customerName}</p>
                      <p className="text-[11.5px] text-ink-subtle truncate">
                        {[stop.address, stop.city].filter(Boolean).join(", ") || "—"}
                        {stop.deliveryNotes && ` · ${stop.deliveryNotes}`}
                      </p>
                    </div>
                    <p className="text-[12.5px] font-semibold tabular shrink-0">
                      {eur(stop.totalGross)}
                    </p>
                    <StopControls
                      stopId={stop.id}
                      isFirst={i === 0}
                      isLast={i === route.stops.length - 1}
                    />
                  </div>
                ))}
              </div>
            )}

            {route.loadingList.length > 0 && (
              <div className="mt-3 pt-3 border-t-2 border-line">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-1.5">
                  Nakladalni list
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {route.loadingList.map((line) => (
                    <p key={line.productName} className="text-[12.5px] text-ink-muted">
                      <span className="font-semibold text-ink">{line.quantity}×</span>{" "}
                      {line.productName}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* --------------------------------------------------- unrouted orders */}
      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
        Nerazporejena naročila
      </h2>

      {unrouted.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-ink-muted">
            Vsa potrjena naročila za ta dan so že na poti.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {unrouted.map((order) => (
            <Card key={order.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[15px] truncate">{order.customerName}</h3>
                  <p className="text-[11.5px] text-ink-subtle mt-0.5">
                    #{order.orderNumber}
                    {order.city && ` · ${order.city}`}
                    {order.deliveryNotes && ` · ${order.deliveryNotes}`}
                  </p>
                </div>
                <p className="text-[13px] font-semibold tabular shrink-0">
                  {eur(order.totalGross)}
                </p>
              </div>
              <p className="text-[12.5px] text-ink-muted mt-2 leading-relaxed">
                {order.lineSummary}
              </p>
              <div className="mt-2.5">
                <AddToRoute orderId={order.id} routes={routes} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
