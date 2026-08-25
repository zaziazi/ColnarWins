"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { dateShort } from "@/lib/format";
import { updateEventNote, updateEventVolume, updateLotAddition, updateLotReading } from "./actions";
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

/**
 * harvest_intake/transfer/adjustment/bottling get full volume+note editing
 * (updateEventVolume re-applies the change to the lot's current running
 * volume — transfer is volume-neutral so it's really just a note+number
 * correction with nothing to cascade). blend_in/blend_retired stay
 * note-only: they involve two lots at once, so correcting their volume
 * consistently on both sides is a separate, harder problem.
 */
const VOLUME_EDITABLE_TYPES: WineLotEvent["eventType"][] = [
  "harvest_intake",
  "transfer",
  "adjustment",
  "bottling",
];

const VOLUME_FIELD_LABEL: Partial<Record<WineLotEvent["eventType"], string>> = {
  harvest_intake: "Sprejeta količina (l)",
  transfer: "Prenesena količina (l)",
  adjustment: "Sprememba (l)",
  bottling: "Porabljeno (l)",
};

/** The types whose "note" is real user text with no number to correct alongside it. */
const NOTE_EDITABLE_TYPES: WineLotEvent["eventType"][] = ["blend_in", "blend_retired", "note"];

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

function ReadingDetailGrid({ event }: { event: WineLotEvent }) {
  const fields = readingFields(event);
  if (fields.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {fields.map((f) => (
        <div key={f}>
          <p className="text-[11px] text-ink-subtle">{FIELD_META[f].label}</p>
          <p className="text-[16px] font-bold tabular">{event[f]}</p>
        </div>
      ))}
    </div>
  );
}

function eventDetailRows(e: WineLotEvent): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  switch (e.eventType) {
    case "harvest_intake":
      if (e.toVesselName) rows.push({ label: "V rezervoar", value: e.toVesselName });
      if (e.volumeL !== null) rows.push({ label: "Količina", value: `${e.volumeL} l` });
      break;
    case "transfer":
      if (e.fromVesselName) rows.push({ label: "Iz", value: e.fromVesselName });
      if (e.toVesselName) rows.push({ label: "V", value: e.toVesselName });
      if (e.volumeL !== null) rows.push({ label: "Količina", value: `${e.volumeL} l` });
      break;
    case "blend_in":
      if (e.relatedLotNumber) rows.push({ label: "Od vina", value: e.relatedLotNumber });
      if (e.volumeL !== null) rows.push({ label: "Količina", value: `+${e.volumeL} l` });
      break;
    case "blend_retired":
      if (e.relatedLotNumber) rows.push({ label: "V vino", value: e.relatedLotNumber });
      if (e.volumeL !== null) rows.push({ label: "Količina", value: `${e.volumeL} l` });
      break;
    case "bottling":
      if (e.volumeL !== null) rows.push({ label: "Porabljeno", value: `${e.volumeL} l` });
      break;
    case "adjustment":
      if (e.volumeL !== null) {
        rows.push({ label: "Sprememba", value: `${e.volumeL > 0 ? "+" : ""}${e.volumeL} l` });
      }
      break;
    case "addition":
      if (e.additiveName) rows.push({ label: "Dodano", value: e.additiveName });
      if (e.amount !== null) {
        rows.push({ label: "Količina", value: `${e.amount}${e.unit ? ` ${e.unit}` : ""}` });
      }
      break;
    default:
      break;
  }
  return rows;
}

function GenericDetailRows({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-ink-subtle">{r.label}</span>
          <span className="text-[15px] font-bold text-right">{r.value}</span>
        </div>
      ))}
    </div>
  );
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
      onDone();
    });
  }

  return (
    <div>
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
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={submit} loading={pending}>
          Shrani popravek
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function EditAdditionForm({
  event,
  onDone,
  onCancel,
}: {
  event: WineLotEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [additiveName, setAdditiveName] = React.useState(event.additiveName ?? "");
  const [amount, setAmount] = React.useState(event.amount !== null ? String(event.amount) : "");
  const [unit, setUnit] = React.useState(event.unit ?? "");
  const [note, setNote] = React.useState(event.note ?? "");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    const name = additiveName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await updateLotAddition({
        eventId: event.id,
        additiveName: name,
        amount: amount ? parseFloat(amount) : undefined,
        unit: unit.trim() || undefined,
        note,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      onDone();
    });
  }

  return (
    <div>
      <FieldLabel>Kaj je bilo dodano</FieldLabel>
      <Input value={additiveName} onChange={(e) => setAdditiveName(e.target.value)} autoFocus />

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <FieldLabel>Količina</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
        <div>
          <FieldLabel>Enota</FieldLabel>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="npr. g, g/hl, ml" />
        </div>
      </div>
      <Textarea
        placeholder="Opomba (neobvezno)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[52px] mt-3"
      />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={submit} loading={pending} disabled={!additiveName.trim()}>
          Shrani popravek
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function EditNoteForm({
  event,
  onDone,
  onCancel,
}: {
  event: WineLotEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [note, setNote] = React.useState(event.note ?? "");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateEventNote({ eventId: event.id, note });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      onDone();
    });
  }

  return (
    <div>
      <FieldLabel>Opomba</FieldLabel>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[80px]" autoFocus />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={submit} loading={pending}>
          Shrani popravek
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function EditVolumeForm({
  event,
  onDone,
  onCancel,
}: {
  event: WineLotEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const allowNegative = event.eventType === "adjustment";
  const [volume, setVolume] = React.useState(event.volumeL !== null ? String(event.volumeL) : "");
  const [note, setNote] = React.useState(event.note ?? "");
  const [pending, startTransition] = React.useTransition();

  function setVolumeField(raw: string) {
    setVolume(allowNegative ? raw.replace(/(?!^-)[^\d.]/g, "") : raw.replace(/[^\d.]/g, ""));
  }

  function submit() {
    const n = parseFloat(volume);
    if (!volume || Number.isNaN(n) || n === 0) return;
    startTransition(async () => {
      const result = await updateEventVolume({ eventId: event.id, volumeL: n, note });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      onDone();
    });
  }

  return (
    <div>
      <FieldLabel>{VOLUME_FIELD_LABEL[event.eventType] ?? "Količina (l)"}</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        value={volume}
        onChange={(e) => setVolumeField(e.target.value)}
        autoFocus
      />
      <Textarea
        placeholder="Opomba"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[52px] mt-3"
      />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={submit} loading={pending} disabled={!volume}>
          Shrani popravek
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Prekliči
        </Button>
      </div>
    </div>
  );
}

function EntryDetail({ event }: { event: WineLotEvent }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);

  function afterSave(message: string) {
    toast.success(message);
    setEditing(false);
    router.refresh();
  }

  const isReading = event.eventType === "reading";
  const isAddition = event.eventType === "addition";
  const isVolumeEditable = VOLUME_EDITABLE_TYPES.includes(event.eventType);
  const isNoteEditable = NOTE_EDITABLE_TYPES.includes(event.eventType);
  const canEdit = isReading || isAddition || isVolumeEditable || isNoteEditable;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <span className="text-[12px] text-ink-subtle">
          {dateShort(event.createdAt)}
          {event.createdByName && ` · ${event.createdByName}`}
        </span>
        {event.editedAt && (
          <span className="text-[11px] text-ink-subtle">urejeno {dateShort(event.editedAt)}</span>
        )}
      </div>

      {editing ? (
        isReading ? (
          <EditReadingForm
            event={event}
            onDone={() => afterSave("Meritev popravljena")}
            onCancel={() => setEditing(false)}
          />
        ) : isAddition ? (
          <EditAdditionForm
            event={event}
            onDone={() => afterSave("Dodatek popravljen")}
            onCancel={() => setEditing(false)}
          />
        ) : isVolumeEditable ? (
          <EditVolumeForm
            event={event}
            onDone={() => afterSave("Količina popravljena")}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <EditNoteForm
            event={event}
            onDone={() => afterSave("Opomba popravljena")}
            onCancel={() => setEditing(false)}
          />
        )
      ) : (
        <>
          {isReading ? (
            <ReadingDetailGrid event={event} />
          ) : (
            <GenericDetailRows rows={eventDetailRows(event)} />
          )}
          {event.note && <p className="text-[14px] text-ink mt-4 leading-relaxed">{event.note}</p>}
          {canEdit && (
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Uredi
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function LotHistory({ events }: { events: WineLotEvent[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  if (events.length === 0) {
    return <p className="p-3.5 text-[13px] text-ink-muted">Ni zgodovine.</p>;
  }

  // Fetched oldest-first (SugarChart needs that order); shown newest-first.
  const newestFirst = [...events].reverse();
  const selected = selectedId ? newestFirst.find((e) => e.id === selectedId) ?? null : null;

  return (
    <div>
      {newestFirst.map((e) => {
        const detail = eventDetail(e);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => setSelectedId(e.id)}
            className="w-full text-left px-3.5 py-2.5 border-b border-line last:border-b-0 hover:bg-surface-muted transition-colors"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{EVENT_LABEL[e.eventType]}</span>
              <span className="text-[11px] text-ink-subtle shrink-0 inline-flex items-center gap-1">
                {dateShort(e.createdAt)}
                {e.createdByName && ` · ${e.createdByName}`}
                <ChevronRight className="size-3.5 text-ink-subtle" />
              </span>
            </div>
            {detail && (
              <p className="text-[12.5px] text-ink-muted mt-0.5 truncate">{detail}</p>
            )}
            {e.editedAt && !detail && (
              <p className="text-[11px] text-ink-subtle mt-0.5">urejeno {dateShort(e.editedAt)}</p>
            )}
          </button>
        );
      })}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && (
          <DialogContent title={EVENT_LABEL[selected.eventType]}>
            <EntryDetail key={selected.id} event={selected} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
