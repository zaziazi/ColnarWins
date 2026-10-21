"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { LOCATION_LABEL, PAYMENT_LABEL, type BookingStatus, type DegustacijaPerson, type PaymentMethod } from "@/lib/types";
import { eur } from "@/lib/format";
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
  winePreferences: string;
  food: boolean;
  foodNotes: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  presenterId: string | null; // "__manual" = typed by hand (presenterName/presenterPhone)
  kitchenId: string | null; // "__manual" = typed by hand (kitchenName/kitchenPhone)
  presenterName?: string;
  presenterPhone?: string;
  kitchenName?: string;
  kitchenPhone?: string;
  status: BookingStatus;
  notes: string;
  peopleActual?: string;
  wineSalesEur?: string;
  location: "klet" | "zidanica";
  /** Agreed price per person (text, so "12,5" can be typed). */
  priceEur: string;
  /** Left empty = people × price. */
  feeEur?: string;
  otherIncomeEur?: string;
  paymentMethod: PaymentMethod | "";
  paid: boolean;
  incomeNote: string;
}

export function emptyDraft(over: Partial<BookingDraft> = {}, kitchenDefault: string | null = null): BookingDraft {
  return {
    groupName: "",
    visitDate: "",
    startTime: "",
    endTime: "",
    people: "",
    winePreferences: "",
    food: true,
    foodNotes: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    presenterId: null,
    kitchenId: kitchenDefault,
    status: "confirmed",
    notes: "",
    location: "klet",
    priceEur: "",
    paymentMethod: "",
    paid: false,
    incomeNote: "",
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
  submitLabel = "Shrani degustacijo",
  onSaved,
}: {
  draft: BookingDraft;
  persons: DegustacijaPerson[];
  submitLabel?: string;
  onSaved: (id: string, d: BookingDraft) => void;
}) {
  const [f, setF] = React.useState<BookingDraft>(draft);
  const [busy, setBusy] = React.useState(false);
  const endTouched = React.useRef(Boolean(draft.endTime));

  const numOf = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s.replace(",", ".")));
  const autoFee = numOf(f.priceEur) !== null && numOf(f.peopleActual) !== null ? Math.round(numOf(f.priceEur)! * numOf(f.peopleActual)! * 100) / 100 : null;
  const incomeTotal = (numOf(f.feeEur) ?? autoFee ?? 0) + (numOf(f.wineSalesEur) ?? 0) + (numOf(f.otherIncomeEur) ?? 0);

  const presenters = persons.filter((p) => p.active && (p.role === "presenter" || p.role === "both"));
  const kitchens = persons.filter((p) => p.active && (p.role === "kitchen" || p.role === "both"));
  async function submit(force = false) {
    if (!f.groupName.trim()) return void toast.error("Vpiši ime skupine.");
    if (!f.visitDate || !f.startTime) return void toast.error("Izberi datum in uro začetka.");
    const presenterManual = f.presenterId === "__manual";
    const kitchenManual = f.food && f.kitchenId === "__manual";
    if (presenterManual && !f.presenterName?.trim()) return void toast.error("Vpiši ime voditelja.");
    if (kitchenManual && !f.kitchenName?.trim()) return void toast.error("Vpiši, kdo pripravi hrano.");
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
      winePreferences: f.winePreferences || null,
      food: f.food,
      foodNotes: f.foodNotes || null,
      contactName: f.contactName || null,
      contactPhone: f.contactPhone || null,
      contactEmail: f.contactEmail || null,
      presenterId: presenterManual ? null : f.presenterId,
      kitchenId: kitchenManual || f.kitchenId === "__manual" ? null : f.kitchenId,
      presenterManual: presenterManual ? { name: f.presenterName!.trim(), phone: f.presenterPhone?.trim() || null } : null,
      kitchenManual: kitchenManual ? { name: f.kitchenName!.trim(), phone: f.kitchenPhone?.trim() || null } : null,
      status: f.status,
      wineSalesEur: num(f.wineSalesEur),
      notes: f.notes || null,
      location: f.location,
      tastingPriceEur: num(f.priceEur),
      tastingFeeEur: num(f.feeEur) ?? (num(f.priceEur) !== null && num(f.peopleActual) !== null ? Math.round(num(f.priceEur)! * num(f.peopleActual)! * 100) / 100 : null),
      otherIncomeEur: num(f.otherIncomeEur),
      incomePaymentMethod: f.paymentMethod || null,
      incomePaid: f.paid,
      incomeNote: f.incomeNote || null,
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
        <div>
          <FieldLabel>Kje</FieldLabel>
          <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5">
            {(["klet", "zidanica"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setF({ ...f, location: l })}
                aria-pressed={f.location === l}
                className={`h-9 px-5 rounded-[8px] text-[13px] font-semibold ${f.location === l ? "bg-wine text-white" : "text-ink-muted"}`}
              >
                {LOCATION_LABEL[l]}
              </button>
            ))}
          </div>
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
        <div className="grid grid-cols-[minmax(0,1fr)_104px_104px] gap-2">
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
        <FieldLabel>Želje glede vin</FieldLabel>
        <Input
          value={f.winePreferences}
          onChange={(e) => setF({ ...f, winePreferences: e.target.value })}
          placeholder="Neobvezno — vina izberemo na licu mesta (npr. raje bela, brez peneče)"
        />
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
              <option value="__manual">Drugo (vpiši ročno)</option>
            </select>
            {f.kitchenId === "__manual" && (
              <div className="grid grid-cols-2 gap-2">
                <Input value={f.kitchenName ?? ""} onChange={(e) => setF({ ...f, kitchenName: e.target.value })} placeholder="Ime" />
                <Input value={f.kitchenPhone ?? ""} onChange={(e) => setF({ ...f, kitchenPhone: e.target.value })} placeholder="Telefon (za sporočilo)" inputMode="tel" />
              </div>
            )}
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
          <option value="__manual">Drugo (vpiši ročno)</option>
        </select>
        {f.presenterId === "__manual" && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Input value={f.presenterName ?? ""} onChange={(e) => setF({ ...f, presenterName: e.target.value })} placeholder="Ime voditelja" />
            <Input value={f.presenterPhone ?? ""} onChange={(e) => setF({ ...f, presenterPhone: e.target.value })} placeholder="Telefon (za sporočilo)" inputMode="tel" />
          </div>
        )}
        {persons.length === 0 && <p className="text-[12px] text-ink-subtle mt-1">Osebe doda vodja v Admin → Degustacije.</p>}
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

      <div>
        <FieldLabel>Dogovorjena cena na osebo (€)</FieldLabel>
        <Input inputMode="decimal" className="max-w-[160px]" value={f.priceEur} onChange={(e) => setF({ ...f, priceEur: e.target.value })} placeholder="npr. 25" />
      </div>

      {(f.status === "visited" || f.peopleActual !== undefined) && (
        <div className="rounded-[var(--radius-control)] border border-line p-3 space-y-3">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Po obisku: kaj smo zaslužili</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Prišlo oseb</FieldLabel>
              <Input inputMode="numeric" value={f.peopleActual ?? ""} onChange={(e) => setF({ ...f, peopleActual: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Prodano vino (€)</FieldLabel>
              <Input inputMode="decimal" value={f.wineSalesEur ?? ""} onChange={(e) => setF({ ...f, wineSalesEur: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Degustacija (€)</FieldLabel>
              <Input
                inputMode="decimal"
                value={f.feeEur ?? ""}
                onChange={(e) => setF({ ...f, feeEur: e.target.value })}
                placeholder={autoFee !== null ? String(autoFee).replace(".", ",") : "osebe × cena"}
              />
            </div>
            <div>
              <FieldLabel>Drugo, npr. hrana (€)</FieldLabel>
              <Input inputMode="decimal" value={f.otherIncomeEur ?? ""} onChange={(e) => setF({ ...f, otherIncomeEur: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <FieldLabel>Način plačila</FieldLabel>
              <select className={selectCls} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value as PaymentMethod | "" })}>
                <option value="">— ni izbran —</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 h-11 text-[13.5px] font-semibold">
              <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Plačano
            </label>
          </div>
          <Input value={f.incomeNote} onChange={(e) => setF({ ...f, incomeNote: e.target.value })} placeholder="Opomba (npr. račun št., plačal vodja skupine)" />
          <p className="text-[13px] font-semibold">Skupaj: {eur(incomeTotal)}</p>
        </div>
      )}

      <div>
        <FieldLabel>Opombe</FieldLabel>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Karkoli, kar mora voditelj vedeti." />
      </div>

      <Button size="lg" onClick={() => void submit(false)} loading={busy}>
        {submitLabel}
      </Button>
    </div>
  );
}
