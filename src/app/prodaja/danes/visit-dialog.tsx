"use client";

import * as React from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { eur, orderTotals } from "@/lib/format";
import { addDays, nextWorkday } from "@/lib/sales/dates";
import type { CarStockRow, PlannedVisit, SalesProduct, VisitOutcome } from "@/lib/types";
import { OUTCOME_LABEL } from "../outcome";
import { addOrderToVisit, completeVisit } from "../teren-actions";

const OUTCOMES: VisitOutcome[] = ["ordered", "thinking", "no_interest", "not_there"];

interface Line {
  productId: string;
  quantity: number;
}

function position(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 3500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
      { timeout: 3000, maximumAge: 60000 },
    );
  });
}

const selectCls = "h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]";

export function VisitDialog({
  visit,
  mode,
  today,
  carStock,
  products,
  onClose,
  onDone,
}: {
  visit: PlannedVisit;
  mode: "visit" | "order";
  today: string;
  carStock: CarStockRow[];
  products: SalesProduct[];
  onClose: () => void;
  onDone: () => void;
}) {
  const orderOnly = mode === "order";
  const [outcome, setOutcome] = React.useState<VisitOutcome | null>(orderOnly ? "ordered" : null);
  const [contact, setContact] = React.useState(visit.contactName ?? visit.knownContact ?? "");
  const [note, setNote] = React.useState("");
  const [followUp, setFollowUp] = React.useState("");
  const [samples, setSamples] = React.useState<Line[]>([]);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [deliveryDate, setDeliveryDate] = React.useState(nextWorkday(today));
  const [orderNote, setOrderNote] = React.useState("");
  const [cust, setCust] = React.useState({
    name: visit.legalName ?? visit.name,
    vatId: visit.vatId ?? "",
    address: visit.address ?? "",
    city: visit.city ?? "",
    postCode: visit.postCode ?? "",
    phone: visit.phone ?? "",
    email: visit.email ?? "",
  });
  const [busy, setBusy] = React.useState(false);

  const car = carStock.filter((r) => r.inCar > 0);
  const productById = new Map(products.map((p) => [p.id, p]));
  const carById = new Map(car.map((r) => [r.productId, r]));

  function pickOutcome(o: VisitOutcome) {
    setOutcome(o);
    if (o === "thinking" && !followUp) setFollowUp(addDays(today, 7));
  }

  const totals = orderTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceNet: productById.get(l.productId)?.price ?? 0,
      vatRate: productById.get(l.productId)?.vat ?? 0.22,
    })),
  );

  async function submit() {
    if (!outcome) return toast.error("Izberi izid obiska.");
    if (outcome === "thinking" && !followUp) return toast.error("Določi datum nadaljnjega obiska ali klica.");
    if (outcome === "ordered") {
      if (lines.length === 0) return toast.error("Dodaj vsaj en izdelek v naročilo.");
      if (!visit.isCustomer && !cust.vatId.trim()) return toast.error("Za novo stranko vnesi davčno številko.");
    }
    const order =
      outcome === "ordered"
        ? {
            deliveryDate,
            note: orderNote,
            lines,
            customer: visit.isCustomer
              ? undefined
              : {
                  name: cust.name,
                  vatId: cust.vatId,
                  address: cust.address,
                  city: cust.city,
                  postCode: cust.postCode,
                  contactName: contact,
                  phone: cust.phone,
                  email: cust.email,
                },
          }
        : null;

    setBusy(true);
    try {
      if (orderOnly) {
        const r = await addOrderToVisit(visit.id, order!);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Naročilo shranjeno kot osnutek — čaka na potrditev.");
        return onDone();
      }
      const gps = await position();
      const r = await completeVisit({
        visitId: visit.id,
        outcome,
        contact,
        note,
        followUp: followUp || null,
        samples,
        gps,
        order,
      });
      if (!r.ok) {
        toast.error(r.error);
        if (r.visitSaved) onDone();
        return;
      }
      toast.success(outcome === "ordered" ? "Obisk in naročilo shranjena — naročilo čaka na potrditev." : "Obisk shranjen.");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={orderOnly ? `Naročilo: ${visit.name}` : visit.name}>
        <div className="space-y-4">
          {!orderOnly && (
            <div>
              <FieldLabel>Kako je šlo?</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => pickOutcome(o)}
                    className={`h-12 rounded-[var(--radius-control)] border text-[13.5px] font-semibold ${
                      outcome === o ? "bg-wine text-white border-wine" : "bg-surface text-ink border-line hover:bg-surface-muted"
                    }`}
                  >
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {outcome && !orderOnly && outcome !== "not_there" && (
            <div>
              <FieldLabel>S kom si govoril?</FieldLabel>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ime in vloga (npr. Mojca, lastnica)" />
            </div>
          )}

          {outcome === "thinking" && (
            <div>
              <FieldLabel>Nadaljnji obisk ali klic do</FieldLabel>
              <Input type="date" value={followUp} min={today} onChange={(e) => setFollowUp(e.target.value)} />
            </div>
          )}

          {outcome && !orderOnly && outcome !== "not_there" && (
            <div>
              <FieldLabel>Vzorci iz avta</FieldLabel>
              {samples.map((s) => {
                const row = carById.get(s.productId)!;
                return (
                  <div key={s.productId} className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[13.5px] min-w-0 truncate">{row.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Stepper step={1} min={1} max={row.inCar} value={s.quantity} onChange={(q) => setSamples((prev) => prev.map((x) => (x.productId === s.productId ? { ...x, quantity: q } : x)))} />
                      <button type="button" aria-label="Odstrani" onClick={() => setSamples((prev) => prev.filter((x) => x.productId !== s.productId))} className="text-ink-subtle hover:text-danger">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {car.length === 0 ? (
                <p className="text-[12.5px] text-ink-subtle">V avtu ni vzorcev. Naloži jih v zavihku Zaloga.</p>
              ) : samples.length >= car.length ? null : (
                <select
                  className={selectCls}
                  value=""
                  onChange={(e) => e.target.value && setSamples((prev) => [...prev, { productId: e.target.value, quantity: 1 }])}
                >
                  <option value="">+ Dodaj vzorec…</option>
                  {car
                    .filter((r) => !samples.some((s) => s.productId === r.productId))
                    .map((r) => (
                      <option key={r.productId} value={r.productId}>
                        {r.name} (v avtu {r.inCar})
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          {outcome === "ordered" && (
            <div className="space-y-3">
              <FieldLabel>Naročilo</FieldLabel>
              {lines.map((l) => {
                const p = productById.get(l.productId)!;
                return (
                  <div key={l.productId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13.5px] truncate">{p.name}</div>
                      <div className="text-[11.5px] text-ink-subtle">{eur(p.price)} / steklenica brez DDV</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Stepper step={p.caseSize ?? 6} min={1} value={l.quantity} onChange={(q) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: q } : x)))} />
                      <button type="button" aria-label="Odstrani" onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} className="text-ink-subtle hover:text-danger">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <select
                className={selectCls}
                value=""
                onChange={(e) => {
                  const p = productById.get(e.target.value);
                  if (p) setLines((prev) => [...prev, { productId: p.id, quantity: p.caseSize ?? 6 }]);
                }}
              >
                <option value="">+ Dodaj izdelek…</option>
                {products
                  .filter((p) => !lines.some((l) => l.productId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {eur(p.price)}
                    </option>
                  ))}
              </select>
              {lines.length > 0 && (
                <div className="text-[12.5px] text-ink-muted flex justify-between">
                  <span>Skupaj brez DDV {eur(totals.net)}</span>
                  <span className="font-semibold text-ink">z DDV {eur(totals.gross)}</span>
                </div>
              )}
              <div>
                <FieldLabel>Dostava</FieldLabel>
                <Input type="date" value={deliveryDate} min={today} onChange={(e) => setDeliveryDate(e.target.value)} />
                <Input className="mt-2" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Opomba za dostavo (neobvezno)" />
              </div>

              {!visit.isCustomer && (
                <div className="rounded-[12px] border border-line p-3 space-y-2">
                  <FieldLabel className="mb-0">Nova stranka</FieldLabel>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    Marija bo podatke preverila, preden gre naročilo naprej.
                  </p>
                  <Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="Ime podjetja" />
                  <Input value={cust.vatId} onChange={(e) => setCust({ ...cust, vatId: e.target.value })} placeholder="Davčna številka (npr. SI12345678)" />
                  <Input value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} placeholder="Naslov" />
                  <div className="grid grid-cols-[96px_1fr] gap-2">
                    <Input value={cust.postCode} onChange={(e) => setCust({ ...cust, postCode: e.target.value })} placeholder="Pošta" />
                    <Input value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} placeholder="Kraj" />
                  </div>
                  <Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="Telefon" />
                  <Input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="E-pošta (za račun)" />
                </div>
              )}
            </div>
          )}

          {outcome && !orderOnly && (
            <div>
              <FieldLabel>Opomba</FieldLabel>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Odziv, kaj jim je bilo všeč, kaj jih zanima…" />
            </div>
          )}

          <Button size="lg" onClick={() => void submit()} loading={busy} disabled={!outcome}>
            {orderOnly ? "Shrani naročilo" : "Shrani obisk"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
