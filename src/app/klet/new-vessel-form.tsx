"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createVessel } from "./actions";

export function NewVesselForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = name.trim();
    const capacityL = parseFloat(capacity);
    if (!trimmed || !capacityL) return;

    startTransition(async () => {
      const result = await createVessel({ name: trimmed, capacityL });
      if (!result.ok) {
        toast.error(result.error ?? "Rezervoarja ni bilo mogoče ustvariti");
        return;
      }
      toast.success(`Rezervoar "${trimmed}" ustvarjen`);
      setName("");
      setCapacity("");
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
