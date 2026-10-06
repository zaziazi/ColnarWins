"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Driver, RouteWithStops } from "@/lib/types";
import { deleteRoute, updateRoute } from "./actions";

/** Pencil on a route card: rename, change driver, or delete a route that hasn't started. */
export function RouteEditor({ route, drivers }: { route: RouteWithStops; drivers: Driver[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [vehicle, setVehicle] = React.useState(route.vehicle);
  const [driverId, setDriverId] = React.useState(route.driverId ?? "");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateRoute({ routeId: route.id, vehicle, driverId: driverId || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pot shranjena");
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteRoute(route.id);
      if (!result.ok) {
        toast.error(result.error);
        setConfirmingDelete(false);
        return;
      }
      toast.success("Pot izbrisana");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-ink-subtle hover:text-ink transition-colors"
      >
        <Pencil className="size-3" /> Uredi pot
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <FieldLabel>Vozilo</FieldLabel>
      <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} autoFocus />

      <FieldLabel className="mt-3">Voznik</FieldLabel>
      <select
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
        className="w-full h-11 px-3 rounded-[var(--radius-control)] bg-surface text-ink border border-line"
      >
        <option value="">— brez voznika —</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2 mt-3.5">
        <Button size="sm" onClick={save} loading={pending} disabled={!vehicle.trim()}>
          Shrani
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Prekliči
        </Button>
        {route.status === "planned" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger hover:bg-danger-soft"
            onClick={() => setConfirmingDelete(true)}
            disabled={pending}
          >
            Izbriši pot
          </Button>
        )}
      </div>

      {confirmingDelete && (
        <Callout tone="danger" className="mt-2.5">
          <p>
            Izbrišem pot »{route.vehicle}«?
            {route.stops.length > 0 && ` ${route.stops.length} naročil se vrne med nerazporejena.`}
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant="danger" onClick={remove} loading={pending}>
              Da, izbriši
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Nazaj
            </Button>
          </div>
        </Callout>
      )}
    </div>
  );
}
