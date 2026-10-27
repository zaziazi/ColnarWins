"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dateShort, eur } from "@/lib/format";
import type { DayOrder, DeliveryDay } from "@/lib/delivery-days";
import { cn } from "@/lib/utils";
import { sendMyOrdersToPrint } from "@/app/tisk/actions";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const label = (date: string, today: string) =>
  date === today ? "Danes" : date === addDays(today, 1) ? "Jutri" : dateShort(new Date(`${date}T12:00:00`));

/** The days of the coming week that have deliveries; tapping one shows what is on it. */
export function DayChips({ days, selected, today, meId }: { days: DeliveryDay[]; selected: string; today: string; meId: string | null }) {
  const upcoming = days.filter((d) => d.date >= today && d.orders.some((o) => !o.cancelled));
  const items = upcoming.some((d) => d.date === today) ? upcoming : [{ date: today, orders: [] as DayOrder[] } as DeliveryDay, ...upcoming];
  if (items.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1" role="tablist" aria-label="Dan dostave">
      {items.map((d) => {
        const active = d.orders.filter((o) => !o.cancelled);
        const mine = active.filter((o) => meId && o.driverId === meId).length;
        const on = d.date === selected;
        return (
          <Link
            key={d.date}
            href={d.date === today ? "/dostava" : `/dostava?d=${d.date}`}
            role="tab"
            aria-selected={on}
            className={cn(
              "shrink-0 rounded-[var(--radius-control)] border px-3 py-1.5 text-left",
              on ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted hover:border-line-strong",
            )}
          >
            <span className="block text-[13px] font-semibold">{label(d.date, today)}</span>
            <span className={cn("block text-[11px]", on ? "text-white/80" : "text-ink-subtle")}>
              {active.length} naroč.{mine > 0 ? ` · moja ${mine}` : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** "Pošlji v tisk": my orders of this day go to the office mailbox, where they are printed for me. */
export function PrintMine({ day, to }: { day: string; to: string }) {
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    setDone(null);
    const r = await sendMyOrdersToPrint(day);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setDone(`Poslano v tisk (${r.sent} naročil). Pisarna ti jih natisne.`);
  }

  return (
    <div className="mb-3">
      <Button size="sm" loading={busy} onClick={() => void send()}>
        <Printer className="size-3.5" /> Pošlji v tisk (pisarna)
      </Button>
      <p className="text-[11.5px] text-ink-subtle mt-1.5">Moja naročila tega dne gredo na {to}, kjer jih v pisarni natisnejo.</p>
      {done && <p className="text-[12.5px] text-good-ink mt-1">{done}</p>}
    </div>
  );
}

/** What is on a future day: read-only, nothing can be ticked off before the day. */
export function DayPreview({ day, meId, today }: { day: DeliveryDay; meId: string | null; today: string }) {
  const active = day.orders.filter((o) => !o.cancelled);
  const mine = active.filter((o) => meId && o.driverId === meId);
  const free = active.filter((o) => !o.driverId && !o.driverName);
  const others = active.filter((o) => !mine.includes(o) && !free.includes(o));
  const groups: [string, DayOrder[]][] = [
    ["Moja naročila", mine],
    ["Brez voznika", free],
    ["Drugi vozniki", others],
  ];

  return (
    <div>
      <Card className="p-4 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Pregled · {label(day.date, today)}</p>
        <p className="mt-1 text-[22px] font-bold tabular tracking-[-0.02em]">
          {active.length} <span className="text-[14px] font-semibold text-ink-subtle">naročil</span>
        </p>
        {!day.confirmedAt && <p className="text-[12px] text-warn mt-1">Dan še ni potrjen v Naročilih, naročila se lahko še spremenijo.</p>}
      </Card>

      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2 px-0.5">
              {title} · {list.length}
            </h2>
            <div className="space-y-2.5">
              {list.map((o) => (
                <Card key={o.orderId} className="p-3.5">
                  <h3 className="font-semibold text-[15px]">{o.customerName}</h3>
                  <p className="text-[11.5px] text-ink-subtle mt-0.5">
                    #{o.orderNumber}
                    {[o.address, o.city].filter(Boolean).length > 0 && ` · ${[o.address, o.city].filter(Boolean).join(", ")}`}
                    {o.driverName && ` · voznik ${o.driverName}`}
                  </p>
                  {(o.driverNote || o.deliveryNotes) && <p className="text-[12px] text-warn font-medium mt-1">{o.driverNote ?? o.deliveryNotes}</p>}
                  {o.paymentMethod === "gotovina" && !o.paidAt && (
                    <div className="mt-1.5">
                      <Badge tone="warn">Gotovina ob dostavi · {eur(o.totalGross)}</Badge>
                    </div>
                  )}
                  <ul className="mt-2 divide-y divide-line">
                    {o.lines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-3 py-1.5 text-[14px]">
                        <span className="min-w-0">
                          {l.productName}
                          {l.freeQty > 0 && <span className="ml-1.5 text-[11.5px] font-semibold text-wine">od tega {l.freeQty} gratis</span>}
                        </span>
                        <span className="tabular font-bold">{l.quantity}×</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
