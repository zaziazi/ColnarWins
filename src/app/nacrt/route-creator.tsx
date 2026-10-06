"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { eur } from "@/lib/format";
import { createRouteWithOrders } from "./actions";
import type { Driver, UnroutedOrder } from "@/lib/types";

/** "Nova pot": pick the driver, tick the unrouted orders for this day, done. */
export function RouteCreator({
  date,
  drivers,
  orders,
}: {
  date: string;
  drivers: Driver[];
  orders: UnroutedOrder[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [vehicle, setVehicle] = React.useState("");
  const [driverId, setDriverId] = React.useState("");
  // Insertion order = stop order, so the sequence follows the tap order.
  const [picked, setPicked] = React.useState<string[]>([]);
  const [pending, startTransition] = React.useTransition();

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function submit() {
    startTransition(async () => {
      const result = await createRouteWithOrders({ date, vehicle, driverId: driverId || null, orderIds: picked });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pot ustvarjena");
      setVehicle("");
      setDriverId("");
      setPicked([]);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Nova pot
      </Button>
    );
  }

  return (
    <Card className="p-3.5 w-full mt-2.5 basis-full">
      <FieldLabel>Voznik</FieldLabel>
      <select
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
        className="w-full h-11 px-3 rounded-[var(--radius-control)] bg-surface text-ink border border-line"
      >
        <option value="">— izberi voznika —</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select>

      <FieldLabel className="mt-3.5">Vozilo (neobvezno)</FieldLabel>
      <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="npr. Kombi 1" />

      <FieldLabel className="mt-3.5">Nerazporejena naročila za ta dan</FieldLabel>
      {orders.length === 0 ? (
        <p className="text-[12.5px] text-ink-subtle">Za ta dan ni nerazporejenih naročil.</p>
      ) : (
        <div className="space-y-1.5">
          {orders.map((o) => {
            const idx = picked.indexOf(o.id);
            const on = idx !== -1;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                aria-pressed={on}
                className={
                  "w-full text-left flex items-start gap-3 p-3 rounded-[var(--radius-control)] border transition-colors " +
                  (on ? "border-wine bg-wine/5" : "border-line bg-surface hover:border-line-strong")
                }
              >
                <span
                  className={
                    "mt-0.5 size-5 shrink-0 rounded-full grid place-items-center text-[11px] font-bold " +
                    (on ? "bg-wine text-white" : "border border-line-strong text-transparent")
                  }
                >
                  {on ? idx + 1 : <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold truncate">{o.customerName}</span>
                  <span className="block text-[11.5px] text-ink-subtle truncate">
                    #{o.orderNumber}
                    {o.city && ` · ${o.city}`}
                    {o.deliveryNotes && ` · ${o.deliveryNotes}`}
                  </span>
                  <span className="block text-[12px] text-ink-muted mt-0.5">{o.lineSummary}</span>
                </span>
                <span className="text-[12.5px] font-semibold tabular shrink-0">{eur(o.totalGross)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 mt-3.5">
        <Button size="sm" onClick={submit} loading={pending} disabled={picked.length === 0}>
          Ustvari pot{picked.length > 0 ? ` (${picked.length})` : ""}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}
