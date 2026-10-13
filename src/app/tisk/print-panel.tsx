"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Hourglass, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dateShort, narocila } from "@/lib/format";
import type { DeliveryDay, DayOrder } from "@/lib/delivery-days";
import { sendToPrint } from "./actions";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string): string {
  const prefix = date === today ? "Danes · " : date === addDays(today, 1) ? "Jutri · " : "";
  return `${prefix}${dateShort(new Date(`${date}T12:00:00`))}`;
}

function sentAt(iso: string): string {
  return new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Not printed yet, or printed before it changed. */
const needsSending = (o: DayOrder) => !o.cancelled && (!o.printSentAt || o.changedAfterPrint);

function StatusBadge({ order }: { order: DayOrder }) {
  if (order.cancelled) return <Badge tone="danger">{order.printSentAt ? "Preklicano po tisku" : "Preklicano"}</Badge>;
  if (order.changedAfterPrint) return <Badge tone="warn">Spremenjeno po tisku</Badge>;
  if (order.printSentAt) return <Badge tone="good">Poslano {sentAt(order.printSentAt)}</Badge>;
  if (order.addedAfterConfirm) return <Badge tone="info">Novo · še ni poslano</Badge>;
  return <Badge tone="neutral">Še ni poslano</Badge>;
}

export function PrintPanel({ days, today, mailTo }: { days: DeliveryDay[]; today: string; mailTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function send(key: string, day: string, orderIds?: string[]) {
    setBusy(key);
    const res = await sendToPrint({ day, orderIds });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  const confirmed = days.filter((d) => d.confirmedAt);
  const waiting = days.filter((d) => !d.confirmedAt && d.date >= today);

  if (days.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Ni naročil za naslednje dni.</p>
      </Card>
    );
  }

  return (
    <div>
      <p className="text-[12.5px] text-ink-muted mb-4 px-0.5 flex items-center gap-1.5">
        <Mail className="size-3.5 shrink-0" /> Naročila se pošljejo na <strong>{mailTo}</strong>, tam jih natisne pisarna.
      </p>

      {confirmed.length === 0 && (
        <Card className="p-5 text-center mb-6">
          <p className="text-[13px] text-ink-muted">Noben dan še ni potrjen. Dostavo za dan potrdiš v zavihku Naročila.</p>
        </Card>
      )}

      {confirmed.map((day) => {
        const active = day.orders.filter((o) => !o.cancelled);
        const pending = active.filter(needsSending);
        const sendIds = pending.length > 0 && pending.length < active.length ? pending.map((o) => o.orderId) : undefined;

        return (
          <section key={day.date} className="mb-7">
            <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
              <div className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle truncate">
                  {dayLabel(day.date, today)}
                </h2>
                <p className="text-[12px] text-ink-muted mt-0.5 truncate">
                  {narocila(active.length)}
                  {day.confirmedByName && ` · potrdil/a ${day.confirmedByName}`}
                </p>
              </div>
              <Button
                size="sm"
                variant={pending.length === 0 ? "secondary" : "primary"}
                loading={busy === day.date}
                disabled={active.length === 0}
                onClick={() => void send(day.date, day.date, sendIds)}
              >
                <Printer className="size-3.5" />
                {pending.length === 0
                  ? "Pošlji znova"
                  : pending.length === active.length
                    ? "Pošlji vse v tisk"
                    : `Pošlji nova in spremenjena (${pending.length})`}
              </Button>
            </div>

            <div className="space-y-2.5">
              {day.orders.map((o) => (
                <Card key={o.orderId} className={o.cancelled ? "p-3.5 bg-surface-muted" : "p-3.5"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={"font-semibold text-[15px] truncate" + (o.cancelled ? " line-through text-ink-subtle" : "")}>
                        {o.customerName}
                      </h3>
                      <p className="text-[11.5px] text-ink-subtle mt-0.5">
                        #{o.orderNumber}
                        {o.city && ` · ${o.city}`}
                      </p>
                    </div>
                    <StatusBadge order={o} />
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {o.lines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate">{l.productName}</span>
                        <span className="tabular font-semibold">{l.quantity}×</span>
                      </li>
                    ))}
                  </ul>
                  {!o.cancelled && (
                    <div className="mt-2.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === o.orderId}
                        onClick={() => void send(o.orderId, day.date, [o.orderId])}
                      >
                        <Mail className="size-3.5" /> {o.printSentAt ? "Pošlji znova" : "Pošlji"}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {waiting.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5 flex items-center gap-1.5">
            <Hourglass className="size-3.5" /> Še ni potrjeno v Naročilih
          </h2>
          <div className="space-y-2.5">
            {waiting.map((day) => (
              <Card key={day.date} className="p-3.5">
                <p className="font-semibold text-[14px]">{dayLabel(day.date, today)}</p>
                <p className="text-[12px] text-ink-muted mt-0.5">{narocila(day.orders.filter((o) => !o.cancelled).length)}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
