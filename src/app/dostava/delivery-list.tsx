"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Undo2, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dateShort } from "@/lib/format";
import type { SimpleRoute } from "@/lib/simple-routes";
import { confirmPlan, setDelivered } from "./actions";

function dayLabel(date: string, today: string): string {
  const t = new Date(`${today}T12:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrow = t.toISOString().slice(0, 10);
  const prefix = date === today ? "Danes · " : date === tomorrow ? "Jutri · " : "";
  return `${prefix}${dateShort(new Date(`${date}T12:00:00`))}${date < today ? " · zamuja" : ""}`;
}

/**
 * The driver's list: confirm the plan once, then cross lines out as they are
 * handed over. Taps apply instantly and are saved in the background; if the
 * save fails the tick is put back and the driver is told.
 */
export function DeliveryList({ routes: initial, today }: { routes: SimpleRoute[]; today: string }) {
  const router = useRouter();
  const [routes, setRoutes] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  // A fresh server copy (after router.refresh) replaces local state.
  React.useEffect(() => setRoutes(initial), [initial]);

  function patchOrder(orderId: string, productId: string | undefined, delivered: boolean) {
    setRoutes((rs) =>
      rs.map((r) => ({
        ...r,
        stops: r.stops.map((s) =>
          s.orderId !== orderId
            ? s
            : {
                ...s,
                lines: s.lines.map((l) =>
                  !productId || l.productId === productId ? { ...l, delivered } : l,
                ),
              },
        ),
      })),
    );
  }

  async function toggle(orderId: string, productId: string | undefined, delivered: boolean) {
    const before = routes;
    patchOrder(orderId, productId, delivered);
    const res = await setDelivered({ orderId, delivered, productId });
    if (!res.ok) {
      setRoutes(before);
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function confirm(routeId: string) {
    setBusy(routeId);
    const res = await confirmPlan(routeId);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  if (routes.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Trenutno ni nobene poti z naročili.</p>
      </Card>
    );
  }

  return (
    <div>
      {routes.map((route) => {
        const planned = route.status === "planned";
        const done = route.stops.filter((s) => s.lines.length > 0 && s.lines.every((l) => l.delivered)).length;

        return (
          <section key={route.id} className="mb-7">
            <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
              <div className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle truncate">
                  {dayLabel(route.date, today)}
                </h2>
                <p className="text-[12px] text-ink-muted mt-0.5 truncate">
                  {route.vehicle}
                  {route.driverName && ` · ${route.driverName}`}
                  {!planned && ` · ${done}/${route.stops.length} dostavljeno`}
                </p>
              </div>
              {planned ? (
                <Button size="sm" onClick={() => void confirm(route.id)} loading={busy === route.id}>
                  <Navigation className="size-3.5" /> Potrdi načrt
                </Button>
              ) : route.status === "completed" ? (
                <Badge tone="good">Vse dostavljeno</Badge>
              ) : (
                <Badge tone="warn">Potrjeno</Badge>
              )}
            </div>

            {planned && (
              <p className="text-[12px] text-ink-muted mb-2.5 px-0.5">
                Preglej naročila in potrdi načrt. Šele nato jih lahko prečrtavaš, pisarna pa jih dobi za tisk.
              </p>
            )}

            <div className="space-y-2.5">
              {route.stops.map((stop, i) => {
                const all = stop.lines.length > 0 && stop.lines.every((l) => l.delivered);
                return (
                  <Card key={stop.orderId} className={cn("p-3.5", all && "bg-surface-muted")}>
                    <div className="flex items-start gap-3">
                      <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0 pt-1">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className={cn("font-semibold text-[15px]", all && "line-through text-ink-subtle")}>
                          {stop.customerName}
                        </h3>
                        <p className="text-[11.5px] text-ink-subtle mt-0.5">
                          #{stop.orderNumber}
                          {[stop.address, stop.city].filter(Boolean).length > 0 &&
                            ` · ${[stop.address, stop.city].filter(Boolean).join(", ")}`}
                          {stop.deliveryNotes && ` · ${stop.deliveryNotes}`}
                        </p>
                        {stop.driverNote && (
                          <p className="text-[12px] text-warn font-medium mt-1">{stop.driverNote}</p>
                        )}
                      </div>
                    </div>

                    <ul className="mt-2.5 divide-y divide-line">
                      {stop.lines.map((l) => (
                        <li key={l.productId}>
                          <button
                            type="button"
                            disabled={planned}
                            onClick={() => void toggle(stop.orderId, l.productId, !l.delivered)}
                            className="w-full flex items-center gap-3 py-2.5 text-left disabled:cursor-default"
                          >
                            <span
                              className={cn(
                                "size-6 shrink-0 grid place-items-center rounded-[6px] border",
                                l.delivered ? "bg-good border-good text-white" : "border-line-strong bg-surface",
                              )}
                            >
                              {l.delivered && <Check className="size-4" strokeWidth={3} />}
                            </span>
                            <span
                              className={cn(
                                "flex-1 text-[14.5px]",
                                l.delivered && "line-through text-ink-subtle",
                              )}
                            >
                              {l.productName}
                            </span>
                            <span
                              className={cn(
                                "tabular font-bold text-[15px]",
                                l.delivered && "line-through text-ink-subtle",
                              )}
                            >
                              {l.quantity}×
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {!planned && stop.lines.length > 0 && (
                      <div className="mt-2.5">
                        {all ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void toggle(stop.orderId, undefined, false)}
                          >
                            <Undo2 className="size-3.5" /> Razveljavi
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => void toggle(stop.orderId, undefined, true)}>
                            <CheckCheck className="size-3.5" /> Vse dostavljeno
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
