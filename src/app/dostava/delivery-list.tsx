"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Undo2, CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dateShort, narocila } from "@/lib/format";
import type { DeliveryDay } from "@/lib/delivery-days";
import { confirmDay, setDelivered, unconfirmDay } from "./actions";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayWord(date: string, today: string): string | null {
  if (date === today) return "danes";
  if (date === addDays(today, 1)) return "jutri";
  return null;
}

function dayLabel(date: string, today: string): string {
  const word = dayWord(date, today);
  const prefix = word ? `${word[0].toUpperCase()}${word.slice(1)} · ` : "";
  return `${prefix}${dateShort(new Date(`${date}T12:00:00`))}${date < today ? " · zamuja" : ""}`;
}

/**
 * The driver's list, by delivery day: confirm a day once (normally the day
 * before), then cross lines out as they are handed over. Taps apply instantly
 * and are saved in the background; if the save fails the tick is put back
 * and the driver is told.
 */
export function DeliveryList({ days: initial, today }: { days: DeliveryDay[]; today: string }) {
  const router = useRouter();
  const [days, setDays] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  // A fresh server copy (after router.refresh) replaces local state.
  React.useEffect(() => setDays(initial), [initial]);

  function patchOrder(orderId: string, productId: string | undefined, delivered: boolean) {
    setDays((ds) =>
      ds.map((d) => ({
        ...d,
        orders: d.orders.map((o) =>
          o.orderId !== orderId
            ? o
            : {
                ...o,
                lines: o.lines.map((l) => (!productId || l.productId === productId ? { ...l, delivered } : l)),
              },
        ),
      })),
    );
  }

  async function toggle(orderId: string, productId: string | undefined, delivered: boolean) {
    const before = days;
    patchOrder(orderId, productId, delivered);
    const res = await setDelivered({ orderId, delivered, productId });
    if (!res.ok) {
      setDays(before);
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function confirm(date: string) {
    setBusy(date);
    const res = await confirmDay(date);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  async function unconfirm(date: string) {
    setBusy(date);
    const res = await unconfirmDay(date);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  if (days.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Ni potrjenih naročil za naslednje dni.</p>
      </Card>
    );
  }

  return (
    <div>
      {days.map((day) => {
        const confirmed = day.confirmedAt !== null;
        const active = day.orders.filter((o) => !o.cancelled);
        const done = active.filter((o) => o.lines.length > 0 && o.lines.every((l) => l.delivered)).length;
        const word = dayWord(day.date, today);
        const nothingPrinted = !day.orders.some((o) => o.printSentAt);

        return (
          <section key={day.date} className="mb-7">
            <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
              <div className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle truncate">
                  {dayLabel(day.date, today)}
                </h2>
                <p className="text-[12px] text-ink-muted mt-0.5 truncate">
                  {narocila(active.length)}
                  {confirmed && ` · ${done}/${active.length} dostavljeno`}
                </p>
              </div>
              {!confirmed ? (
                <Button size="sm" onClick={() => void confirm(day.date)} loading={busy === day.date}>
                  <CalendarCheck className="size-3.5" /> Potrdi dostavo{word ? ` za ${word}` : ""}
                </Button>
              ) : done === active.length && active.length > 0 ? (
                <Badge tone="good">Vse dostavljeno</Badge>
              ) : (
                <Badge tone="warn">Potrjeno</Badge>
              )}
            </div>

            {!confirmed && (
              <p className="text-[12px] text-ink-muted mb-2.5 px-0.5">
                Preglej naročila in potrdi dostavo. Šele nato jih lahko prečrtavaš, pisarna pa jih dobi za tisk.
              </p>
            )}
            {confirmed && nothingPrinted && (
              <button
                type="button"
                onClick={() => void unconfirm(day.date)}
                className="text-[12px] text-ink-subtle underline underline-offset-2 mb-2.5 px-0.5"
              >
                Prekliči potrditev
              </button>
            )}

            <div className="space-y-2.5">
              {day.orders.map((order, i) => {
                const all = order.lines.length > 0 && order.lines.every((l) => l.delivered);
                const locked = !confirmed || order.cancelled;
                return (
                  <Card key={order.orderId} className={cn("p-3.5", (all || order.cancelled) && "bg-surface-muted")}>
                    <div className="flex items-start gap-3">
                      <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0 pt-1">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className={cn(
                              "font-semibold text-[15px]",
                              (all || order.cancelled) && "line-through text-ink-subtle",
                            )}
                          >
                            {order.customerName}
                          </h3>
                          {order.cancelled ? (
                            <Badge tone="danger">Preklicano</Badge>
                          ) : order.addedAfterConfirm ? (
                            <Badge tone="info">Novo</Badge>
                          ) : null}
                        </div>
                        <p className="text-[11.5px] text-ink-subtle mt-0.5">
                          #{order.orderNumber}
                          {[order.address, order.city].filter(Boolean).length > 0 &&
                            ` · ${[order.address, order.city].filter(Boolean).join(", ")}`}
                          {order.deliveryNotes && ` · ${order.deliveryNotes}`}
                        </p>
                        {order.driverNote && (
                          <p className="text-[12px] text-warn font-medium mt-1">{order.driverNote}</p>
                        )}
                      </div>
                    </div>

                    <ul className="mt-2.5 divide-y divide-line">
                      {order.lines.map((l) => (
                        <li key={l.productId}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => void toggle(order.orderId, l.productId, !l.delivered)}
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
                                (l.delivered || order.cancelled) && "line-through text-ink-subtle",
                              )}
                            >
                              {l.productName}
                            </span>
                            <span
                              className={cn(
                                "tabular font-bold text-[15px]",
                                (l.delivered || order.cancelled) && "line-through text-ink-subtle",
                              )}
                            >
                              {l.quantity}×
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {!locked && order.lines.length > 0 && (
                      <div className="mt-2.5">
                        {all ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void toggle(order.orderId, undefined, false)}
                          >
                            <Undo2 className="size-3.5" /> Razveljavi
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => void toggle(order.orderId, undefined, true)}>
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
