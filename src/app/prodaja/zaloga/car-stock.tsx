"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { steklenice } from "@/lib/format";
import type { CarStockRow, RepMovement } from "@/lib/types";
import { checkoutStock, returnStock } from "../teren-actions";

const KIND_LABEL: Record<RepMovement["kind"], string> = {
  checkout: "Naloženo v avto",
  given: "Vzorec",
  return: "Vrnjeno v klet",
};

const dt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-2 mt-5">{children}</div>;
}

export function CarStock({ stock, movements }: { stock: CarStockRow[]; movements: RepMovement[] }) {
  const router = useRouter();
  const [load, setLoad] = React.useState<Record<string, number>>({});
  const [back, setBack] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState<"load" | "back" | null>(null);

  const inCar = stock.filter((r) => r.inCar > 0);
  const loadable = stock.filter((r) => r.cellarQty > 0);
  const totalCar = inCar.reduce((s, r) => s + r.inCar, 0);
  const loadCount = Object.values(load).reduce((s, n) => s + n, 0);
  const backCount = Object.values(back).reduce((s, n) => s + n, 0);

  async function submit(kind: "load" | "back") {
    const src = kind === "load" ? load : back;
    const items = Object.entries(src)
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (items.length === 0) return;
    setBusy(kind);
    const r = await (kind === "load" ? checkoutStock(items) : returnStock(items));
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(kind === "load" ? "Naloženo v avto" : "Vrnjeno v klet");
    (kind === "load" ? setLoad : setBack)({});
    router.refresh();
  }

  return (
    <div>
      <Card className="p-4">
        <div className="text-[12px] text-ink-subtle">Trenutno v avtu</div>
        <div className="text-[26px] font-bold tracking-[-0.02em]">{steklenice(totalCar)}</div>
        {inCar.length > 0 && (
          <div className="mt-2 space-y-1">
            {inCar.map((r) => (
              <div key={r.productId} className="flex justify-between text-[13.5px]">
                <span>{r.name}</span>
                <span className="font-bold tabular">{r.inCar}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Heading>Naloži iz kleti</Heading>
      <Card>
        {loadable.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">V kleti ni izdelkov na zalogi.</p>
        ) : (
          loadable.map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold truncate">{r.name}</div>
                <div className="text-[11.5px] text-ink-subtle">v kleti {r.cellarQty}</div>
              </div>
              <Stepper step={1} max={r.cellarQty} value={load[r.productId] ?? 0} onChange={(q) => setLoad((p) => ({ ...p, [r.productId]: q }))} />
            </div>
          ))
        )}
      </Card>
      <Button className="w-full mt-2.5" disabled={loadCount === 0} loading={busy === "load"} onClick={() => void submit("load")}>
        Naloži v avto ({loadCount})
      </Button>

      {inCar.length > 0 && (
        <>
          <Heading>Vrni v klet</Heading>
          <Card>
            {inCar.map((r) => (
              <div key={r.productId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{r.name}</div>
                  <div className="text-[11.5px] text-ink-subtle">v avtu {r.inCar}</div>
                </div>
                <Stepper step={1} max={r.inCar} value={back[r.productId] ?? 0} onChange={(q) => setBack((p) => ({ ...p, [r.productId]: q }))} />
              </div>
            ))}
          </Card>
          <Button variant="secondary" className="w-full mt-2.5" disabled={backCount === 0} loading={busy === "back"} onClick={() => void submit("back")}>
            Vrni v klet ({backCount})
          </Button>
        </>
      )}

      <Heading>Zgodovina</Heading>
      <Card>
        {movements.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Še ni gibanja.</p>
        ) : (
          movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0">
              <div className="min-w-0">
                <div className="text-[13.5px] truncate">
                  {m.quantity}× {m.productName}
                </div>
                <div className="text-[11.5px] text-ink-subtle truncate">
                  {KIND_LABEL[m.kind]}
                  {m.venueName && ` · ${m.venueName}`} · {dt.format(new Date(m.createdAt))}
                </div>
              </div>
              <span className={`text-[13px] font-bold tabular ${m.kind === "checkout" ? "text-good" : "text-ink-muted"}`}>
                {m.kind === "checkout" ? "+" : "−"}
                {m.quantity}
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
