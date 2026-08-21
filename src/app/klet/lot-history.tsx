"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { dateShort } from "@/lib/format";
import { updateLotReading } from "./actions";
import { FIELD_META, type ReadingField } from "./lot-actions";
import type { WineLotEvent } from "@/lib/types";

export const EVENT_LABEL: Record<WineLotEvent["eventType"], string> = {
  harvest_intake: "Sprejem",
  transfer: "Prenos",
  blend_in: "Zlitje (prejeto)",
  blend_retired: "Zlitje (preneseno)",
  stage_change: "Sprememba faze",
  name_change: "Sprememba imena",
  reading: "Meritev",
  note: "Opomba",
  bottling: "Stekleničenje",
  adjustment: "Ostali komentarji",
  addition: "Dodatek",
};

export function eventDetail(e: WineLotEvent): string | null {
  switch (e.eventType) {
    case "harvest_intake":
      return e.toVesselName ? `${e.toVesselName} · +${e.volumeL} l` : null;
    case "transfer":
      return e.fromVesselName && e.toVesselName
        ? `${e.fromVesselName} → ${e.toVesselName} · ${e.volumeL} l`
        : null;
    case "blend_in":
      return [e.relatedLotNumber && `od ${e.relatedLotNumber}`, e.volumeL && `+${e.volumeL} l`]
        .filter(Boolean)
        .join(" · ") || null;
    case "blend_retired":
      return [e.relatedLotNumber && `v ${e.relatedLotNumber}`, e.volumeL && `${e.volumeL} l`]
        .filter(Boolean)
        .join(" · ") || null;
    case "bottling":
      return e.volumeL ? `−${e.volumeL} l` : null;
    case "adjustment":
      return e.volumeL ? `${e.volumeL > 0 ? "+" : ""}${e.volumeL} l` : null;
    case "addition":
      return [e.additiveName, e.amount !== null && `${e.amount}${e.unit ? ` ${e.unit}` : ""}`]
        .filter(Boolean)
        .join(" · ") || null;
    case "reading":
      return (
        [
          e.sugarGl !== null && `sladkor ${e.sugarGl} g/l`,
          e.density !== null && `gostota ${e.density}`,
          e.ph !== null && `pH ${e.ph}`,
          e.alcohol !== null && `alk. ${e.alcohol}%`,
          e.so2 !== null && `SO2 ${e.so2}`,
          e.co2 !== null && `CO2 ${e.co2}`,
          e.malicAcid !== null && `jabolčna ${e.malicAcid}`,
          e.tartaricAcid !== null && `vinska ${e.tartaricAcid}`,
          e.lacticAcid !== null && `mlečna ${e.lacticAcid}`,
          e.totalAcid !== null && `skupna ${e.totalAcid}`,
          e.volatileAcid !== null && `hlapna ${e.volatileAcid}`,
          e.yan !== null && `YAN ${e.yan} mg/l`,
        ]
          .filter(Boolean)
          .join(" · ") || null
      );
    default:
      return null;
  }
}

/** Fields that already carry a value on this reading — editing only corrects what was actually measured. */
function readingFields(e: WineLotEvent): ReadingField[] {
  return (Object.keys(FIELD_META) as ReadingField[]).filter((f) => e[f] !== null);
}

function EditReadingForm({
  event,
  onDone,
  onCancel,
}: {
  event: WineLotEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const fields = readingFields(event);
  const [values, setValues] = React.useState<Record<ReadingField, string>>(() => {
    const v = {} as Record<ReadingField, string>;
    for (const f of Object.keys(FIELD_META) as ReadingField[]) {
      const existing = event[f];
      v[f] = existing !== null ? String(existing) : "";
    }
    return v;
  });
  const [note, setNote] = React.useState(event.note ?? "");
  const [pending, startTransition] = React.useTransition();

  function setField(field: ReadingField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw.replace(/[^\d.]/g, "") }));
  }

  function submit() {
    startTransition(async () => {
      const result = await updateLotReading({
        eventId: event.id,
        sugarGl: values.sugarGl ? parseFloat(values.sugarGl) : undefined,
        density: values.density ? parseFloat(values.density) : undefined,
        ph: values.ph ? parseFloat(values.ph) : undefined,
        so2: values.so2 ? parseFloat(values.so2) : undefined,
        malicAcid: values.malicAcid ? parseFloat(values.malicAcid) : undefined,
        tartaricAcid: values.tartaricAcid ? parseFloat(values.tartaricAcid) : undefined,
        lacticAcid: values.lacticAcid ? parseFloat(values.lacticAcid) : undefined,
        totalAcid: values.totalAcid ? parseFloat(values.totalAcid) : undefined,
        volatileAcid: values.volatileAcid ? parseFloat(values.volatileAcid) : undefined,
        co2: values.co2 ? parseFloat(values.co2) : undefined,
        alcohol: values.alcohol ? parseFloat(values.alcohol) : undefined,
        yan: values.yan ? parseFloat(values.yan) : undefined,
        note,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      toast.success("Meritev popravljena");
      onDone();
    });
  }

  return (
    <Card className="p-3 mt-2 bg-surface-muted">
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
      <Textarea
        placeholder="Opomba (okus, vonj, videz…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[52px] mt-2"
      />
      <div className="flex gap-2 mt-2.5">
        <Button size="sm" onClick={submit} loading={pending}>
          Shrani popravek
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}

export function LotHistory({ events }: { events: WineLotEvent[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);

  if (events.length === 0) {
    return <p className="p-3.5 text-[13px] text-ink-muted">Ni zgodovine.</p>;
  }

  // Fetched oldest-first (SugarChart needs that order); shown newest-first.
  const newestFirst = [...events].reverse();

  return (
    <div>
      {newestFirst.map((e) => {
        const detail = eventDetail(e);
        const editable = e.eventType === "reading";
        return (
          <div key={e.id} className="px-3.5 py-2.5 border-b border-line last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold inline-flex items-center gap-1.5">
                {EVENT_LABEL[e.eventType]}
                {editable && editingId !== e.id && (
                  <button
                    type="button"
                    aria-label="Uredi meritev"
                    onClick={() => setEditingId(e.id)}
                    className="text-ink-subtle hover:text-ink"
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </span>
              <span className="text-[11px] text-ink-subtle shrink-0">
                {dateShort(e.createdAt)}
                {e.createdByName && ` · ${e.createdByName}`}
              </span>
            </div>
            {detail && <p className="text-[12.5px] text-ink-muted mt-0.5">{detail}</p>}
            {e.note && <p className="text-[12.5px] text-ink-muted mt-0.5">{e.note}</p>}
            {e.editedAt && (
              <p className="text-[11px] text-ink-subtle mt-0.5">urejeno {dateShort(e.editedAt)}</p>
            )}

            {editingId === e.id && (
              <EditReadingForm
                event={e}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
