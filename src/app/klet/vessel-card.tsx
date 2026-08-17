"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { adjustVessel, recordBottlingRun, recordHarvestIntake } from "./actions";
import { cn } from "@/lib/utils";
import type { Product, Vessel } from "@/lib/types";

type Mode = null | "sprejem" | "steklenicenje" | "popravek";

export function VesselCard({ vessel, products }: { vessel: Vessel; products: Product[] }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const fillPct = vessel.capacityL > 0 ? Math.min(100, (vessel.currentVolumeL / vessel.capacityL) * 100) : 0;

  function toggle(next: Mode) {
    setMode((m) => (m === next ? null : next));
  }

  function afterSuccess(message: string) {
    toast.success(message);
    setMode(null);
    router.refresh();
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[15px] truncate">{vessel.name}</h3>
          <p className="text-[11.5px] text-ink-subtle mt-0.5">
            {vessel.currentProductName ?? "prazen"} · {vessel.currentVolumeL.toLocaleString("sl-SI")} /{" "}
            {vessel.capacityL.toLocaleString("sl-SI")} l
          </p>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full bg-wine transition-[width]"
          style={{ width: `${fillPct}%` }}
        />
      </div>

      <div className="flex gap-1.5 mt-3">
        <Button
          size="sm"
          variant={mode === "sprejem" ? "primary" : "secondary"}
          onClick={() => toggle("sprejem")}
        >
          Sprejem
        </Button>
        {vessel.currentProductId && (
          <Button
            size="sm"
            variant={mode === "steklenicenje" ? "primary" : "secondary"}
            onClick={() => toggle("steklenicenje")}
          >
            Stekleničenje
          </Button>
        )}
        <Button
          size="sm"
          variant={mode === "popravek" ? "primary" : "secondary"}
          onClick={() => toggle("popravek")}
        >
          Popravek
        </Button>
      </div>

      {mode === "sprejem" && (
        <HarvestIntakeForm vesselId={vessel.id} products={products} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
      {mode === "steklenicenje" && (
        <BottlingForm vesselId={vessel.id} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
      {mode === "popravek" && (
        <VesselAdjustmentForm vesselId={vessel.id} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
    </Card>
  );
}

function HarvestIntakeForm({
  vesselId,
  products,
  onDone,
  onCancel,
}: {
  vesselId: string;
  products: Product[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = React.useState<string | null>(null);
  const [volumeL, setVolumeL] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const volume = parseFloat(volumeL);
    if (!productId || !volume) return;

    startTransition(async () => {
      const result = await recordHarvestIntake({ vesselId, productId, volumeL: volume, note });
      if (!result.ok) {
        toast.error(result.error ?? "Sprejem ni uspel");
        return;
      }
      onDone("Sprejem zabeležen");
    });
  }

  return (
    <div className={cn("mt-3 pt-3 border-t border-line space-y-2.5")}>
      <div>
        <FieldLabel>Izdelek</FieldLabel>
        <Combobox
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          value={productId}
          onChange={setProductId}
          placeholder="Izberi izdelek…"
        />
      </div>
      <div>
        <FieldLabel>Litri</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={volumeL}
          onChange={(e) => setVolumeL(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="npr. 500"
          autoFocus
        />
      </div>
      <Textarea placeholder="Opomba (neobvezno)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!productId || !volumeL}>
          Zabeleži sprejem
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function BottlingForm({
  vesselId,
  onDone,
  onCancel,
}: {
  vesselId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [liters, setLiters] = React.useState("");
  const [bottles, setBottles] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const litersConsumed = parseFloat(liters);
    const bottlesProduced = parseInt(bottles, 10);
    if (!litersConsumed || !bottlesProduced) return;

    startTransition(async () => {
      const result = await recordBottlingRun({ vesselId, litersConsumed, bottlesProduced, note });
      if (!result.ok) {
        toast.error(result.error ?? "Stekleničenje ni uspelo");
        return;
      }
      onDone("Stekleničenje zabeleženo");
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2.5">
      <div>
        <FieldLabel>Porabljeni litri</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={liters}
          onChange={(e) => setLiters(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="npr. 450"
          autoFocus
        />
      </div>
      <div>
        <FieldLabel>Pridobljene steklenice</FieldLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={bottles}
          onChange={(e) => setBottles(e.target.value.replace(/\D/g, ""))}
          placeholder="npr. 600"
        />
      </div>
      <Textarea placeholder="Opomba (neobvezno)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!liters || !bottles}>
          Zabeleži stekleničenje
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function VesselAdjustmentForm({
  vesselId,
  onDone,
  onCancel,
}: {
  vesselId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [deltaL, setDeltaL] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const delta = parseFloat(deltaL);
    if (!delta) return;

    startTransition(async () => {
      const result = await adjustVessel({ vesselId, deltaL: delta, note });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      onDone("Rezervoar posodobljen");
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2.5">
      <div>
        <FieldLabel>Sprememba (l)</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={deltaL}
          onChange={(e) => setDeltaL(e.target.value.replace(/(?!^-)[^\d.]/g, ""))}
          placeholder="npr. -15 ali 20"
          autoFocus
        />
      </div>
      <Textarea
        placeholder="Razlog (npr. izhlapevanje, dolivanje)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[52px]"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!deltaL}>
          Shrani
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}
