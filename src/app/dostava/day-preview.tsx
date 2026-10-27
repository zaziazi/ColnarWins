"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dateShort, eur } from "@/lib/format";
import type { DayOrder, DeliveryDay } from "@/lib/delivery-days";
import { cn } from "@/lib/utils";
import { mailDayToMe } from "./actions";

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

/** "Pošlji meni": the deliveries of this day by e-mail, to print yourself. Asks for the address once. */
export function MailToMe({ day, email }: { day: string; email: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [address, setAddress] = React.useState(email ?? "");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    const r = await mailDayToMe({ day, scope, email: address.trim() });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setSent(`Poslano na ${r.to} (${r.count} naročil).`);
  }

  return (
    <div className="mb-4">
      <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        <Mail className="size-3.5" /> Pošlji meni na e-pošto
      </Button>
      {open && (
        <Card className="p-3.5 mt-2.5 space-y-2.5">
          <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5" role="group" aria-label="Katera naročila">
            {(
              [
                ["mine", "Moja naročila"],
                ["all", "Vsa naročila dneva"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                aria-pressed={scope === k}
                onClick={() => setScope(k)}
                className={cn("h-8 px-3 rounded-[8px] text-[12.5px] font-semibold", scope === k ? "bg-wine text-white" : "text-ink-muted")}
              >
                {t}
              </button>
            ))}
          </div>
          <Input type="email" inputMode="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Tvoj e-naslov" className="max-w-[320px]" />
          <p className="text-[11.5px] text-ink-subtle">Vsako naročilo je na svoji strani, pripravljeno za tisk. E-naslov se shrani za naslednjič.</p>
          <div className="flex items-center gap-3">
            <Button size="sm" loading={busy} disabled={!address.trim()} onClick={() => void send()}>
              Pošlji
            </Button>
            {sent && <span className="text-[12.5px] text-good-ink">{sent}</span>}
          </div>
        </Card>
      )}
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
