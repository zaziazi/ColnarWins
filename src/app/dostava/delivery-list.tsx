"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Pencil, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import { dateShort } from "@/lib/format";
import type { DeliveryDay } from "@/lib/delivery-days";
import { setDelivered } from "./actions";

/**
 * Today's deliveries: a counter at the top, then every order with its lines
 * to cross out as they are handed over. Taps apply instantly and are saved
 * in the background; if the save fails the tick is put back and the driver
 * is told. Orders added or cancelled since the day was confirmed are marked.
 */
export function DeliveryList({ day: initial, date }: { day: DeliveryDay | null; date: string }) {
  const router = useRouter();
  const [day, setDay] = React.useState(initial);

  // A fresh server copy (after router.refresh) replaces local state.
  React.useEffect(() => setDay(initial), [initial]);

  async function toggle(orderId: string, productId: string | undefined, delivered: boolean) {
    const before = day;
    setDay((d) =>
      d
        ? {
            ...d,
            orders: d.orders.map((o) =>
              o.orderId !== orderId
                ? o
                : { ...o, lines: o.lines.map((l) => (!productId || l.productId === productId ? { ...l, delivered } : l)) },
            ),
          }
        : d,
    );
    const res = await setDelivered({ orderId, delivered, productId });
    if (!res.ok) {
      setDay(before);
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  const orders = day?.orders ?? [];
  const active = orders.filter((o) => !o.cancelled);
  const isDone = (o: (typeof orders)[number]) => o.lines.length > 0 && o.lines.every((l) => l.delivered);
  const done = active.filter(isDone).length;
  const pct = active.length > 0 ? Math.round((done / active.length) * 100) : 0;

  if (!day || orders.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Za danes ni potrjenih naročil za dostavo.</p>
      </Card>
    );
  }

  return (
    <div>
      <Card className="p-4 mb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
              Danes · {dateShort(new Date(`${date}T12:00:00`))}
            </p>
            <p className="mt-1 text-[26px] leading-none font-bold tabular tracking-[-0.02em]">
              {done}
              <span className="text-ink-subtle font-semibold"> / {active.length}</span>
            </p>
            <p className="text-[12px] text-ink-muted mt-1">
              {done === active.length ? "Vse dostavljeno" : "dostav opravljenih"}
            </p>
          </div>
          {done === active.length && <Badge tone="good">Končano</Badge>}
        </div>
        <div className="mt-3 h-2 rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full bg-good transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {!day.confirmedAt && (
        <Callout tone="warn" className="mb-4">
          Ta dan še ni potrjen v zavihku Naročila, zato tudi ni v Tisku.
        </Callout>
      )}

      <div className="space-y-2.5">
        {orders.map((order, i) => {
          const all = isDone(order);
          const locked = order.cancelled;
          return (
            <Card key={order.orderId} className={cn("p-3.5", (all || order.cancelled) && "bg-surface-muted")}>
              <div className="flex items-start gap-3">
                <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0 pt-1">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn("font-semibold text-[15px]", (all || order.cancelled) && "line-through text-ink-subtle")}
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
                  {order.driverNote && <p className="text-[12px] text-warn font-medium mt-1">{order.driverNote}</p>}
                  {!order.cancelled && (
                    <div className="mt-1.5">
                      {order.changedAfterPrint ? (
                        <Badge tone="warn">Spremenjeno po tisku</Badge>
                      ) : order.printSentAt ? (
                        <Badge tone="good">Poslano v tisk</Badge>
                      ) : (
                        <Badge tone="neutral">Še ni v tisku</Badge>
                      )}
                    </div>
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
                        className={cn("flex-1 text-[14.5px]", (l.delivered || order.cancelled) && "line-through text-ink-subtle")}
                      >
                        {l.productName}
                      </span>
                      <span
                        className={cn("tabular font-bold text-[15px]", (l.delivered || order.cancelled) && "line-through text-ink-subtle")}
                      >
                        {l.quantity}×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {!locked && order.lines.length > 0 && (
                <div className="mt-2.5 flex items-center gap-2">
                  {all ? (
                    <Button variant="secondary" size="sm" onClick={() => void toggle(order.orderId, undefined, false)}>
                      <Undo2 className="size-3.5" /> Razveljavi
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void toggle(order.orderId, undefined, true)}>
                        <CheckCheck className="size-3.5" /> Vse dostavljeno
                      </Button>
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/pisarna/${order.orderId}/uredi`}>
                          <Pencil className="size-3.5" /> Uredi
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
