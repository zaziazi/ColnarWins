"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { BookingStatus, DegustacijaPerson } from "@/lib/types";
import { saveBooking } from "./actions";

export interface BookingDraft {
  id?: string;
  drustvoId?: string | null;
  webReservationId?: string | null;
  groupName: string;
  visitDate: string;
  startTime: string;
  endTime: string;
  people: string;
  wines: string[];
  food: boolean;
  foodNotes: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  presenterId: string | null;
  kitchenId: string | null;
  status: BookingStatus;
  notes: string;
  peopleActual?: string;
  wineSalesEur?: string;
}

export function emptyDraft(over: Partial<BookingDraft> = {}, kitchenDefault: string | null = null): BookingDraft {
  return {
    groupName: "",
    visitDate: "",
    startTime: "",
    endTime: "",
    people: "",
    wines: [],
    food: true,
    foodNotes: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    presenterId: null,
    kitchenId: kitchenDefault,
    status: "confirmed",
    notes: "",
    ...over,
  };
}

const plusHours = (hhmm: string, h: number) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  const t = hh * 60 + mm + h * 60;
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const selectCls = "h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]";

/**
 * One form for every way a tasting gets in: typed in by hand, edited from the
 * calendar, or confirmed from a website request. The presenter and the
 * kitchen person get their messages the day before once it is confirmed.
 */
export function BookingForm({
  draft,
  persons,
  wineOptions,
  submitLabel = "Shrani degustacijo",
  onSaved,
}: {
  draft: BookingDraft;
  persons: DegustacijaPerson[];
  wineOptions: string[];
  submitLabel?: string;
  onSaved: (id: string, d: BookingDraft) => void;
}) {
  const [f, setF] = React.useState<BookingDraft>(draft);
  const [custom, setCustom] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endTouched = React.useRef(Boolean(draft.endTime));

  const presenters = persons.filter((p) => p.active && (p.role === "presenter" || p.role === "both"));
  const kitchens = persons.filter((p) => p.active && (p.role === "kitchen" || p.role === "both"));
  const all = [...new Set([...wineOptions, ...f.wines])];

  function toggleWine(w: string) {
    setF((prev) => ({ ...prev, wines: prev.wines.includes(w) ? prev.wines.filter((x) => x !== w) : [...prev.wines, w] }));
  }

  async function submit(force = false) {
    if (!f.groupName.trim()) return void toast.error("Vpiši ime skupine.");
    if (!f.visitDate || !f.startTime) return void toast.error("Izberi datum in uro začetka.");
    const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s.replace(",", ".")));
    setBusy(true);
    const r = await saveBooking({
      id: f.id,
      drustvoId: f.drustvoId ?? null,
      webReservationId: f.webReservationId ?? null,
      groupName: f.groupName,
      visitDate: f.visitDate,
      startTime: f.startTime,
      endTime: f.endTime || null,
      peoplePlanned: num(f.people),
      peopleActual: num(f.peopleActual),
      wines: f.wines,
      food: f.food,
      foodNotes: f.foodNotes || null,
      contactName: f.contactName || null,
      contactPhone: f.contactPhone || null,
      contactEmail: f.contactEmail || null,
      presenterId: f.presenterId,
      kitchenId: f.kitchenId,
      status: f.status,
      wineSalesEur: num(f.wineSalesEur),
      notes: f.notes || null,
      force,
    });
    setBusy(false);
    if (!r.ok) {
      if (r.warning && window.confirm(`${r.error}\\n\\nVseeno shraniti?`)) return void submit(true);
      if (!r.warning) toast.error(r.error);
      return;
    }
    toast.success("Degustacija shranjena");
    onSaved(r.id, f);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div>
          <FieldLabel>Skupina</FieldLabel>
          <Input value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value })} placeholder="Ime skupine, društva ali podjetja" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Število oseb</FieldLabel>
            <Input inputMode="numeric" value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Stanje</FieldLabel>
            <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as BookingStatus })}>
              <option value="confirmed">Potrjeno</option>
              <option value="tentative">Okvirno</option>
              <option value="visited">Obiskali</option>
              <option value="cancelled">Preklicano</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <FieldLabel>Kdaj</FieldLabel>
        <div className="grid grid-cols-[1fr_112px_112px] gap-2">
          <Input type="date" value={f.visitDate} onChange={(e) => setF({ ...f, visitDate: e.target.value })} />
          <Input
            type="time"
            value={f.startTime}
            onChange={(e) => {
              const v = e.target.value;
              setF((prev) => ({ ...prev, startTime: v, endTime: !endTouched.current && v ? plusHours(v, 2) : prev.endTime }));
            }}
            aria-label="Začetek"
          />
          <Input
            type="time"
            value={f.endTime}
            onChange={(e) => {
              endTouched.current = true;
              setF({ ...f, endTime: e.target.value });
            }}
            aria-label="Konec"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Vina {f.wines.length > 0 && `(${f.wines.length})`}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {all.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => toggleWine(w)}
              aria-pressed={f.wines.includes(w)}
              className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border ${f.wines.includes(w) ? "bg-wine text-white border-wine" : "bg-surface text-ink-muted border-line"}`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Drugo vino…" className="h-10" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const v = custom.trim();
              if (v && !f.wines.includes(v)) setF({ ...f, wines: [...f.wines, v] });
              setCustom("");
            }}
          >
            <Plus className="size-4" /> Dodaj
          </Button>
        </div>
      </div>

      <div>
        <FieldLabel>Hrana</FieldLabel>
        <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5 mb-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setF({ ...f, food: v })}
              aria-pressed={f.food === v}
              className={`h-9 px-5 rounded-[8px] text-[13px] font-semibold ${f.food === v ? "bg-wine text-white" : "text-ink-muted"}`}
            >
              {v ? "Da" : "Ne"}
            </button>
          ))}
        </div>
        {f.food && (
          <div className="space-y-2">
            <Input value={f.foodNotes} onChange={(e) => setF({ ...f, foodNotes: e.target.value })} placeholder="Kaj (npr. kruh z namazi), alergije, vegetarijanci…" />
            <select className={selectCls} value={f.kitchenId ?? ""} onChange={(e) => setF({ ...f, kitchenId: e.target.value || null })} aria-label="Kdo pripravi hrano">
              <option value="">Kdo pripravi hrano? (ni izbrano)</option>
              {kitchens.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <FieldLabel>Voditelj degustacije</FieldLabel>
        <select className={selectCls} value={f.presenterId ?? ""} onChange={(e) => setF({ ...f, presenterId: e.target.value || null })}>
          <option value="">Ni izbran</option>
          {presenters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {persons.length === 0 && <p className="text-[12px] text-ink-subtle mt-1">Osebe dodaš v Nastavitvah.</p>}
        <p className="text-[12px] text-ink-subtle mt-1">Voditelj in kuhinja dobita sporočilo dan prej.</p>
      </div>

      <div>
        <FieldLabel>Kontakt skupine</FieldLabel>
        <div className="space-y-2">
          <Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} placeholder="Ime in priimek" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} placeholder="Telefon" />
            <Input value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} placeholder="E-pošta" />
          </div>
        </div>
      </div>

      {(f.status === "visited" || f.peopleActual !== undefined) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Prišlo oseb</FieldLabel>
            <Input inputMode="numeric" value={f.peopleActual ?? ""} onChange={(e) => setF({ ...f, peopleActual: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Prodano vino (€)</FieldLabel>
            <Input inputMode="decimal" value={f.wineSalesEur ?? ""} onChange={(e) => setF({ ...f, wineSalesEur: e.target.value })} />
          </div>
        </div>
      )}

      <div>
        <FieldLabel>Opombe</FieldLabel>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Karkoli, kar mora voditelj vedeti." />
      </div>

      <Button size="lg" onClick={() => void submit(false)} loading={busy}>
        {submitLabel}
      </Button>
      {f.wines.length > 0 && (
        <button type="button" className="text-[12px] text-ink-subtle inline-flex items-center gap-1" onClick={() => setF({ ...f, wines: [] })}>
          <X className="size-3" /> Počisti izbor vin
        </button>
      )}
    </div>
  );
}
