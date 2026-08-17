"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createVessel } from "./actions";
import type { VesselMaterial } from "@/lib/types";

export function NewVesselForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [material, setMaterial] = React.useState<VesselMaterial>("stainless");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = name.trim();
    const capacityL = parseFloat(capacity);
    if (!trimmed || !capacityL) return;

    startTransition(async () => {
      const result = await createVessel({ name: trimmed, capacityL, material });
      if (!result.ok) {
        toast.error(result.error ?? "Rezervoarja ni bilo mogoče ustvariti");
        return;
      }
      toast.success(`Rezervoar "${trimmed}" ustvarjen`);
      setName("");
      setCapacity("");
      setMaterial("stainless");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Nov rezervoar
      </Button>
    );
  }

  return (
    <Card className="p-3.5">
      <FieldLabel>Ime</FieldLabel>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="npr. Cisterna 3"
        autoFocus
      />

      <FieldLabel className="mt-3.5">Kapaciteta (l)</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        value={capacity}
        onChange={(e) => setCapacity(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="npr. 2000"
      />

      <FieldLabel className="mt-3.5">Vrsta</FieldLabel>
      <div className="inline-flex rounded-[var(--radius-control)] border border-line overflow-hidden">
        <button
          type="button"
          onClick={() => setMaterial("stainless")}
          className={cn(
            "h-9 px-3.5 text-[13px] font-semibold transition-colors",
            material === "stainless" ? "bg-wine text-white" : "bg-surface text-ink-muted hover:bg-surface-muted",
          )}
        >
          Inox
        </button>
        <button
          type="button"
          onClick={() => setMaterial("wood")}
          className={cn(
            "h-9 px-3.5 text-[13px] font-semibold transition-colors border-l border-line",
            material === "wood" ? "bg-wine text-white" : "bg-surface text-ink-muted hover:bg-surface-muted",
          )}
        >
          Les
        </button>
      </div>

      <div className="flex gap-2 mt-3.5">
        <Button size="sm" onClick={submit} loading={pending} disabled={!name.trim() || !capacity}>
          Ustvari rezervoar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}
