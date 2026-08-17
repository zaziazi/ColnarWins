"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createRoute } from "./actions";
import type { Driver } from "@/lib/types";

export function RouteCreator({ date, drivers }: { date: string; drivers: Driver[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [vehicle, setVehicle] = React.useState("");
  const [driverId, setDriverId] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const name = vehicle.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await createRoute({ date, vehicle: name, driverId: driverId || null });
      if (!result.ok) {
        toast.error(result.error ?? "Poti ni bilo mogoče ustvariti");
        return;
      }
      toast.success(`Pot "${name}" ustvarjena`);
      setVehicle("");
      setDriverId("");
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
    <Card className="p-3.5">
      <FieldLabel>Vozilo</FieldLabel>
      <Input
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        placeholder="npr. Kombi 1"
        autoFocus
      />

      <FieldLabel className="mt-3.5">Voznik</FieldLabel>
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

      <div className="flex gap-2 mt-3.5">
        <Button size="sm" onClick={submit} loading={pending} disabled={!vehicle.trim()}>
          Ustvari pot
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}
