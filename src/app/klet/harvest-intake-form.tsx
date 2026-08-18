"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { recordHarvestIntake } from "./actions";
import type { Vessel } from "@/lib/types";

export function HarvestIntakeForm({ emptyVessels }: { emptyVessels: Vessel[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [vesselId, setVesselId] = React.useState("");
  const [name, setName] = React.useState("");
  const [volumeL, setVolumeL] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = name.trim();
    const volume = parseFloat(volumeL);
    if (!vesselId || !trimmed || !volume) return;

    startTransition(async () => {
      const result = await recordHarvestIntake({ vesselId, name: trimmed, volumeL: volume, note });
      if (!result.ok) {
        toast.error(result.error ?? "Sprejem ni uspel");
        return;
      }
      toast.success(`Sprejem "${trimmed}" zabeležen`);
      setVesselId("");
      setName("");
      setVolumeL("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="lg" className="mb-5" onClick={() => setOpen(true)} disabled={emptyVessels.length === 0}>
        <Plus /> Sprejem
      </Button>
    );
  }

  return (
    <Card className="p-3.5 mb-5">
      <FieldLabel>Rezervoar</FieldLabel>
      <select
        value={vesselId}
        onChange={(e) => setVesselId(e.target.value)}
        className="w-full h-11 px-3 rounded-[var(--radius-control)] bg-surface text-ink border border-line"
        autoFocus
      >
        <option value="">— izberi prazen rezervoar —</option>
        {emptyVessels.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      <FieldLabel className="mt-3.5">Ime</FieldLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="npr. Cviček surovina 2026" />

      <FieldLabel className="mt-3.5">Litri</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        value={volumeL}
        onChange={(e) => setVolumeL(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="npr. 500"
      />

      <Textarea
        placeholder="Opomba (neobvezno)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[52px] mt-3.5"
      />

      <div className="flex gap-2 mt-3.5">
        <Button size="sm" onClick={submit} loading={pending} disabled={!vesselId || !name.trim() || !volumeL}>
          Zabeleži sprejem
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}
