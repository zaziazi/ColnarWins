"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Hourglass, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dateShort, narocila } from "@/lib/format";
import type { SimpleRoute } from "@/lib/simple-routes";
import { sendToPrint } from "./actions";

function dayLabel(date: string, today: string): string {
  const t = new Date(`${today}T12:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrow = t.toISOString().slice(0, 10);
  const prefix = date === today ? "Danes · " : date === tomorrow ? "Jutri · " : "";
  return `${prefix}${dateShort(new Date(`${date}T12:00:00`))}`;
}

function sentAt(iso: string): string {
  return new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function PrintPanel({ routes, today, mailTo }: { routes: SimpleRoute[]; today: string; mailTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function send(key: string, routeId: string, orderIds?: string[]) {
    setBusy(key);
    const res = await sendToPrint({ routeId, orderIds });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Poslano na ${res.to} (${res.sent})`);
    router.refresh();
  }

  const confirmed = routes.filter((r) => r.status !== "planned");
  const waiting = routes.filter((r) => r.status === "planned");

  if (routes.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Ni načrtov dostave.</p>
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
          <p className="text-[13px] text-ink-muted">Noben načrt še ni potrjen. Voznik ga potrdi v zavihku Dostava.</p>
        </Card>
      )}

      {confirmed.map((route) => {
        const unsent = route.stops.filter((s) => !s.printSentAt);
        return (
          <section key={route.id} className="mb-7">
            <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
              <div className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle truncate">
                  {dayLabel(route.date, today)}
                </h2>
                <p className="text-[12px] text-ink-muted mt-0.5 truncate">
                  {route.vehicle}
                  {route.driverName && ` · ${route.driverName}`} · {narocila(route.stops.length)}
                </p>
              </div>
              <Button
                size="sm"
                variant={unsent.length === 0 ? "secondary" : "primary"}
                loading={busy === route.id}
                disabled={route.stops.length === 0}
                onClick={() =>
                  void send(route.id, route.id, unsent.length > 0 && unsent.length < route.stops.length ? unsent.map((s) => s.orderId) : undefined)
                }
              >
                <Printer className="size-3.5" />
                {unsent.length === 0
                  ? "Pošlji znova"
                  : unsent.length === route.stops.length
                    ? "Pošlji vse v tisk"
                    : `Pošlji neposlana (${unsent.length})`}
              </Button>
            </div>

            <div className="space-y-2.5">
              {route.stops.map((stop) => (
                <Card key={stop.orderId} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[15px] truncate">{stop.customerName}</h3>
                      <p className="text-[11.5px] text-ink-subtle mt-0.5">
                        #{stop.orderNumber}
                        {stop.city && ` · ${stop.city}`}
                      </p>
                    </div>
                    {stop.printSentAt ? (
                      <Badge tone="good">Poslano {sentAt(stop.printSentAt)}</Badge>
                    ) : (
                      <Badge tone="neutral">Še ni poslano</Badge>
                    )}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {stop.lines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate">{l.productName}</span>
                        <span className="tabular font-semibold">{l.quantity}×</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === stop.orderId}
                      onClick={() => void send(stop.orderId, route.id, [stop.orderId])}
                    >
                      <Mail className="size-3.5" /> {stop.printSentAt ? "Pošlji znova" : "Pošlji"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {waiting.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5 flex items-center gap-1.5">
            <Hourglass className="size-3.5" /> Čaka na potrditev voznika
          </h2>
          <div className="space-y-2.5">
            {waiting.map((route) => (
              <Card key={route.id} className="p-3.5">
                <p className="font-semibold text-[14px]">
                  {dayLabel(route.date, today)} · {route.vehicle}
                </p>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  {narocila(route.stops.length)}{route.driverName && ` · ${route.driverName}`}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
