"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateVessel } from "../actions";
import type { Vessel } from "@/lib/types";

export function VesselEditForm({ vessel }: { vessel: Vessel }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(vessel.name);
  const [capacity, setCapacity] = React.useState(String(vessel.capacityL));
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = name.trim();
    const capacityL = parseFloat(capacity);
    if (!trimmed || !capacityL) return;

    startTransition(async () => {
      const result = await updateVessel({ vesselId: vessel.id, name: trimmed, capacityL });
      if (!result.ok) {
        toast.error(result.error ?? "Posodobitev ni uspela");
        return;
      }
      toast.success("Rezervoar posodobljen");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-left"
      >
        <span className="text-xl font-bold tracking-[-0.02em]">{vessel.name}</span>
        <Pencil className="size-3.5 text-ink-subtle" />
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <FieldLabel>Ime</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div>
        <FieldLabel>Kapaciteta (l)</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!name.trim() || !capacity}>
          Shrani
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setName(vessel.name);
            setCapacity(String(vessel.capacityL));
          }}
        >
          Prekliči
        </Button>
      </div>
    </div>
  );
}
