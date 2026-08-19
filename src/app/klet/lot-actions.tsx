"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import {
  adjustLotVolume,
  recordLotBottling,
  recordLotReading,
  transferWineLot,
  updateLotName,
  updateLotStage,
} from "./actions";
import type { Product, Vessel, WineLot } from "@/lib/types";

const STAGE_OPTIONS: { value: WineLot["stage"]; label: string }[] = [
  { value: "grozdje", label: "Grozdje" },
  { value: "vrenje", label: "Vrenje" },
  { value: "vino", label: "Vino" },
];

type ReadingField =
  | "sugarGl"
  | "ph"
  | "so2"
  | "malicAcid"
  | "tartaricAcid"
  | "lacticAcid"
  | "totalAcid"
  | "volatileAcid"
  | "co2"
  | "alcohol";

const FIELD_META: Record<ReadingField, { label: string; placeholder: string }> = {
  sugarGl: { label: "Sladkor (g/l)", placeholder: "npr. 200" },
  ph: { label: "pH", placeholder: "npr. 3.3" },
  so2: { label: "SO2 (mg/l)", placeholder: "npr. 30" },
  malicAcid: { label: "Jabolčna kislina (g/l)", placeholder: "npr. 3" },
  tartaricAcid: { label: "Vinska kislina (g/l)", placeholder: "npr. 5" },
  lacticAcid: { label: "Mlečna kislina (g/l)", placeholder: "npr. 1" },
  totalAcid: { label: "Skupna kislina (g/l)", placeholder: "npr. 6" },
  volatileAcid: { label: "Hlapna kislina (g/l)", placeholder: "npr. 0.5" },
  co2: { label: "CO2 (g/l)", placeholder: "npr. 2" },
  alcohol: { label: "Alkohol (%)", placeholder: "npr. 12" },
};

const STAGE_FIELDS: Record<WineLot["stage"], ReadingField[]> = {
  grozdje: ["sugarGl", "ph", "malicAcid", "tartaricAcid", "totalAcid", "volatileAcid"],
  vrenje: ["sugarGl", "ph", "alcohol", "co2", "malicAcid", "lacticAcid", "totalAcid", "volatileAcid"],
  vino: ["ph", "alcohol", "sugarGl", "so2"],
};

export function LotName({ lot }: { lot: WineLot }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(lot.name);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === lot.name) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await updateLotName({ lotId: lot.id, name: trimmed });
      if (!result.ok) {
        toast.error(result.error ?? "Preimenovanje ni uspelo");
        return;
      }
      toast.success("Ime posodobljeno");
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
        <span className="text-xl font-bold tracking-[-0.02em]">{lot.name}</span>
        <Pencil className="size-3.5 text-ink-subtle" />
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="h-9 text-[15px]"
      />
      <Button size="sm" onClick={submit} loading={pending} disabled={!name.trim()}>
        Shrani
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(lot.name); }}>
        Prekliči
      </Button>
    </div>
  );
}

export function StageSelector({ lot }: { lot: WineLot }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function select(stage: WineLot["stage"]) {
    if (stage === lot.stage) return;
    startTransition(async () => {
      const result = await updateLotStage({ lotId: lot.id, stage });
      if (!result.ok) {
        toast.error(result.error ?? "Sprememba faze ni uspela");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-[var(--radius-control)] border border-line overflow-hidden">
      {STAGE_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          disabled={pending}
          onClick={() => select(opt.value)}
          className={cn(
            "h-9 px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
            i > 0 && "border-l border-line",
            lot.stage === opt.value ? "bg-wine text-white" : "bg-surface text-ink-muted hover:bg-surface-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type Mode = null | "prenos" | "meritev" | "popravek" | "steklenicenje";

export function LotActions({
  lot,
  vessels,
  products,
}: {
  lot: WineLot;
  vessels: Vessel[];
  products: Product[];
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);

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
      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" variant={mode === "prenos" ? "primary" : "secondary"} onClick={() => toggle("prenos")}>
          Prenos
        </Button>
        <Button size="sm" variant={mode === "meritev" ? "primary" : "secondary"} onClick={() => toggle("meritev")}>
          Meritev
        </Button>
        <Button size="sm" variant={mode === "popravek" ? "primary" : "secondary"} onClick={() => toggle("popravek")}>
          Popravek
        </Button>
        <Button
          size="sm"
          variant={mode === "steklenicenje" ? "primary" : "secondary"}
          onClick={() => toggle("steklenicenje")}
        >
          Stekleničenje
        </Button>
      </div>

      {mode === "prenos" && (
        <TransferForm lot={lot} vessels={vessels} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
      {mode === "meritev" && <ReadingForm lot={lot} onDone={afterSuccess} onCancel={() => setMode(null)} />}
      {mode === "popravek" && (
        <AdjustmentForm lotId={lot.id} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
      {mode === "steklenicenje" && (
        <BottlingForm lot={lot} products={products} onDone={afterSuccess} onCancel={() => setMode(null)} />
      )}
    </Card>
  );
}

function TransferForm({
  lot,
  vessels,
  onDone,
  onCancel,
}: {
  lot: WineLot;
  vessels: Vessel[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [vesselId, setVesselId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const options = vessels
    .filter((v) => v.id !== lot.vesselId)
    .map((v) => ({
      value: v.id,
      label: v.name,
      hint: v.activeLotId ? `${v.activeLotNumber} · ${v.activeLotName} · ${v.activeLotVolumeL} l` : "prazen",
    }));

  function submit() {
    if (!vesselId) return;
    startTransition(async () => {
      const result = await transferWineLot({ lotId: lot.id, toVesselId: vesselId, note });
      if (!result.ok) {
        toast.error(result.error ?? "Prenos ni uspel");
        return;
      }
      onDone("Vino preneseno");
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2.5">
      <div>
        <FieldLabel>V rezervoar</FieldLabel>
        <Combobox
          options={options}
          value={vesselId}
          onChange={setVesselId}
          placeholder="Izberi rezervoar…"
        />
      </div>
      <Textarea placeholder="Opomba (neobvezno)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!vesselId}>
          Prenesi
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function ReadingForm({
  lot,
  onDone,
  onCancel,
}: {
  lot: WineLot;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const fields = STAGE_FIELDS[lot.stage];
  const [values, setValues] = React.useState<Record<ReadingField, string>>({
    sugarGl: "", ph: "", so2: "", malicAcid: "", tartaricAcid: "",
    lacticAcid: "", totalAcid: "", volatileAcid: "", co2: "", alcohol: "",
  });
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const hasValue = fields.some((f) => values[f]) || note.trim();

  function setField(field: ReadingField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw.replace(/[^\d.]/g, "") }));
  }

  function submit() {
    if (!hasValue) return;
    startTransition(async () => {
      const result = await recordLotReading({
        lotId: lot.id,
        sugarGl: values.sugarGl ? parseFloat(values.sugarGl) : undefined,
        ph: values.ph ? parseFloat(values.ph) : undefined,
        so2: values.so2 ? parseFloat(values.so2) : undefined,
        malicAcid: values.malicAcid ? parseFloat(values.malicAcid) : undefined,
        tartaricAcid: values.tartaricAcid ? parseFloat(values.tartaricAcid) : undefined,
        lacticAcid: values.lacticAcid ? parseFloat(values.lacticAcid) : undefined,
        totalAcid: values.totalAcid ? parseFloat(values.totalAcid) : undefined,
        volatileAcid: values.volatileAcid ? parseFloat(values.volatileAcid) : undefined,
        co2: values.co2 ? parseFloat(values.co2) : undefined,
        alcohol: values.alcohol ? parseFloat(values.alcohol) : undefined,
        note,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Meritev ni uspela");
        return;
      }
      onDone("Meritev zabeležena");
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f, i) => (
          <div key={f}>
            <FieldLabel>{FIELD_META[f].label}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={values[f]}
              onChange={(e) => setField(f, e.target.value)}
              placeholder={FIELD_META[f].placeholder}
              autoFocus={i === 0}
            />
          </div>
        ))}
      </div>
      <Textarea placeholder="Opomba (okus, vonj, videz…)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!hasValue}>
          Zabeleži meritev
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function AdjustmentForm({
  lotId,
  onDone,
  onCancel,
}: {
  lotId: string;
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
      const result = await adjustLotVolume({ lotId, deltaL: delta, note });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      onDone("Količina posodobljena");
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
      <Textarea placeholder="Razlog (npr. izhlapevanje, dolivanje)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
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

function BottlingForm({
  lot,
  products,
  onDone,
  onCancel,
}: {
  lot: WineLot;
  products: Product[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [productId, setProductId] = React.useState<string | null>(null);
  const [liters, setLiters] = React.useState("");
  const [bottles, setBottles] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const litersConsumed = parseFloat(liters);
    const bottlesProduced = parseInt(bottles, 10);
    if (!productId || !litersConsumed || !bottlesProduced) return;
    startTransition(async () => {
      const result = await recordLotBottling({
        lotId: lot.id,
        productId,
        litersConsumed,
        bottlesProduced,
        note,
      });
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
        <FieldLabel>Izdelek</FieldLabel>
        <Combobox
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          value={productId}
          onChange={setProductId}
          placeholder="Izberi izdelek…"
        />
      </div>
      <div>
        <FieldLabel>Porabljeni litri (od {lot.volumeL.toLocaleString("sl-SI")} l)</FieldLabel>
        <Input type="text" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value.replace(/[^\d.]/g, ""))} placeholder="npr. 450" />
      </div>
      <div>
        <FieldLabel>Pridobljene steklenice</FieldLabel>
        <Input type="text" inputMode="numeric" value={bottles} onChange={(e) => setBottles(e.target.value.replace(/\D/g, ""))} placeholder="npr. 600" />
      </div>
      <Textarea placeholder="Opomba (neobvezno)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[52px]" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={pending} disabled={!productId || !liters || !bottles}>
          Zabeleži stekleničenje
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}
