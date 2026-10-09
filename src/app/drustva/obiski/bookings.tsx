"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { dayMonth, addDays, weekdayName } from "@/lib/sales/dates";
import { freeDates } from "@/lib/drustva/capacity";
import type { BookingStatus, DrustvaSettings, GroupBooking } from "@/lib/types";
import { saveBooking } from "../actions";
import { BOOKING_LABEL } from "../constants";

const TONE: Record<BookingStatus, "warn" | "good" | "info" | "danger"> = { tentative: "warn", confirmed: "good", visited: "info", cancelled: "danger" };
type Draft = Partial<GroupBooking> & { drustvoId: string; visitDate: string; status: BookingStatus };

export function Bookings({
  today,
  bookings,
  settings,
  drustva,
}: {
  today: string;
  bookings: GroupBooking[];
  settings: DrustvaSettings;
  drustva: { id: string; name: string; town: string | null }[];
}) {
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const upcoming = bookings.filter((b) => b.visitDate >= today && b.status !== "cancelled");
  const past = bookings.filter((b) => b.visitDate < today || b.status === "cancelled").reverse();
  const free = freeDates(today, settings, bookings);

  return (
    <div className="space-y-4">
      <Button className="w-full" onClick={() => setEditing({ drustvoId: "", visitDate: free[0] ?? today, status: "tentative" })}>
        <Plus className="size-4" /> Nov obisk skupine
      </Button>

      <Card className="p-3.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-1.5">Prosti termini (naslednjih 8 tednov)</div>
        {free.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">Ni prostih terminov. Preveri nastavitve (dnevi in največ skupin na dan).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {free.slice(0, 24).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setEditing({ drustvoId: "", visitDate: d, status: "tentative" })}
                className="h-8 px-2.5 rounded-full border border-line bg-surface text-[12px] font-semibold text-ink-muted hover:border-wine hover:text-wine"
              >
                {weekdayName(d).slice(0, 3)} {new Date(`${d}T12:00:00Z`).getUTCDate()}. {new Date(`${d}T12:00:00Z`).getUTCMonth() + 1}.
              </button>
            ))}
          </div>
        )}
      </Card>

      <Section title={`Prihodnji obiski (${upcoming.length})`} items={upcoming} onOpen={(b) => setEditing(b)} empty="Ni načrtovanih obiskov." />
      {past.length > 0 && <Section title="Pretekli in preklicani" items={past} onOpen={(b) => setEditing(b)} />}

      {editing && <BookingDialog key={editing.id ?? "new"} draft={editing} drustva={drustva} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Section({ title, items, onOpen, empty }: { title: string; items: GroupBooking[]; onOpen: (b: GroupBooking) => void; empty?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-2">{title}</div>
      {items.length === 0 && empty && <p className="text-[13px] text-ink-subtle">{empty}</p>}
      <div className="space-y-2">
        {items.map((b) => (
          <button key={b.id} type="button" className="w-full text-left" onClick={() => onOpen(b)}>
            <Card className="p-3.5 hover:border-line-strong transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] truncate">{b.drustvoName}</div>
                  <div className="text-[12px] text-ink-subtle">
                    {weekdayName(b.visitDate)}, {dayMonth(b.visitDate)}
                    {b.arrivalTime && ` · ${b.arrivalTime}`}
                    {b.peoplePlanned !== null && ` · ${b.peoplePlanned} oseb`}
                    {b.package && ` · ${b.package}`}
                  </div>
                </div>
                <Badge tone={TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function BookingDialog({
  draft,
  drustva,
  onClose,
}: {
  draft: Draft;
  drustva: { id: string; name: string; town: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = React.useState({
    drustvoId: draft.drustvoId,
    visitDate: draft.visitDate,
    arrivalTime: draft.arrivalTime ?? "",
    peoplePlanned: draft.peoplePlanned?.toString() ?? "",
    peopleActual: draft.peopleActual?.toString() ?? "",
    package: draft.package ?? "",
    pricePerPerson: draft.pricePerPerson?.toString() ?? "",
    foodNotes: draft.foodNotes ?? "",
    status: draft.status,
    wineSalesEur: draft.wineSalesEur?.toString() ?? "",
    notes: draft.notes ?? "",
  });
  const [busy, setBusy] = React.useState(false);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  async function submit() {
    if (!f.drustvoId) return void toast.error("Izberi društvo.");
    setBusy(true);
    const r = await saveBooking({
      id: draft.id,
      drustvoId: f.drustvoId,
      visitDate: f.visitDate,
      arrivalTime: f.arrivalTime || null,
      peoplePlanned: num(f.peoplePlanned),
      peopleActual: num(f.peopleActual),
      package: f.package || null,
      pricePerPerson: num(f.pricePerPerson),
      foodNotes: f.foodNotes || null,
      status: f.status,
      wineSalesEur: num(f.wineSalesEur),
      notes: f.notes || null,
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Obisk shranjen");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={draft.id ? "Obisk skupine" : "Nov obisk skupine"}>
        <div className="space-y-3">
          <div>
            <FieldLabel>Društvo</FieldLabel>
            <Combobox
              options={drustva.map((d) => ({ value: d.id, label: d.name, hint: d.town ?? undefined }))}
              value={f.drustvoId || null}
              onChange={(v) => setF({ ...f, drustvoId: v })}
              placeholder="Izberi društvo…"
              searchPlaceholder="Išči društvo…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Datum</FieldLabel>
              <Input type="date" value={f.visitDate} onChange={(e) => setF({ ...f, visitDate: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Prihod</FieldLabel>
              <Input type="time" value={f.arrivalTime} onChange={(e) => setF({ ...f, arrivalTime: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Število oseb</FieldLabel>
              <Input inputMode="numeric" value={f.peoplePlanned} onChange={(e) => setF({ ...f, peoplePlanned: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Cena na osebo (€)</FieldLabel>
              <Input inputMode="decimal" value={f.pricePerPerson} onChange={(e) => setF({ ...f, pricePerPerson: e.target.value })} />
            </div>
          </div>
          <div>
            <FieldLabel>Paket</FieldLabel>
            <Input value={f.package} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="npr. pokušina + malica" />
          </div>
          <div>
            <FieldLabel>Hrana in posebnosti</FieldLabel>
            <Textarea value={f.foodNotes} onChange={(e) => setF({ ...f, foodNotes: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Stanje</FieldLabel>
            <select className="h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as BookingStatus })}>
              {Object.entries(BOOKING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {(f.status === "visited" || draft.status === "visited") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Prišlo oseb</FieldLabel>
                <Input inputMode="numeric" value={f.peopleActual} onChange={(e) => setF({ ...f, peopleActual: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Prodano vino (€)</FieldLabel>
                <Input inputMode="decimal" value={f.wineSalesEur} onChange={(e) => setF({ ...f, wineSalesEur: e.target.value })} />
              </div>
            </div>
          )}
          <div>
            <FieldLabel>Opombe</FieldLabel>
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button size="lg" onClick={() => void submit()} loading={busy}>Shrani</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
