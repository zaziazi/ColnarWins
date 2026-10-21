"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, FieldLabel } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { eur, dateSl, inCartons, kartoni, lineNet, steklenice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_LABEL, type Customer, type Driver, type PaymentMethod, type PriceList, type Product, type StandingOrder, type StandingOrderLine } from "@/lib/types";
import { createOrder, createPersonCustomer } from "@/app/pisarna/novo/actions";
import { updateOrder } from "@/app/pisarna/actions";

type UnitMode = "piece" | "case";

interface EditOrder {
  id: string;
  customerId: string;
  deliveryDate: string | null;
  note: string;
  driverId: string | null;
  driverName: string | null;
  priceList: PriceList;
  paymentMethod: PaymentMethod;
  lines: StandingOrderLine[];
}

interface Props {
  customers: Customer[];
  products: Product[];
  standingOrders: StandingOrder[];
  /** Next few plausible delivery dates, computed on the server. */
  deliveryDates: string[];
  /** Optional driver choice; the order works without one. */
  drivers: Driver[];
  /** When present, edits this existing draft instead of creating a new order. */
  editOrder?: EditOrder;
}

/**
 * Phone order form.
 *
 * The design target is 45 seconds from picking up the phone to a confirmed
 * order, without touching the keyboard except for the note. Everything here
 * serves that: the standing order pre-fills, quantities step by case, and the
 * running total is always visible so the operator can read it back on the call.
 */
export function OrderForm({
  customers,
  products,
  standingOrders,
  deliveryDates,
  drivers,
  editOrder,
}: Props) {
  const router = useRouter();

  const [customerId, setCustomerId] = React.useState<string | null>(
    editOrder?.customerId ?? null,
  );
  const [quantities, setQuantities] = React.useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const line of editOrder?.lines ?? []) next[line.productId] = line.quantity;
    return next;
  });
  const [unitModes, setUnitModes] = React.useState<Record<string, UnitMode>>({});
  const [deliveryDate, setDeliveryDate] = React.useState(
    editOrder?.deliveryDate ?? deliveryDates[0] ?? "",
  );
  const [note, setNote] = React.useState(editOrder?.note ?? "");
  const [priceList, setPriceList] = React.useState<PriceList>(editOrder?.priceList ?? "gostinci");
  // "__other" = someone not on the list, typed by hand.
  const [driverId, setDriverId] = React.useState(editOrder?.driverId ?? (editOrder?.driverName ? "__other" : ""));
  const [driverName, setDriverName] = React.useState(editOrder?.driverName ?? "");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(editOrder?.paymentMethod ?? "trr");
  // per product: discount in percent (text, so "7,5" can be typed) and how many bottles go out as a gift
  const [discounts, setDiscounts] = React.useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const line of editOrder?.lines ?? []) if (line.discountPct) next[line.productId] = String(Math.round(line.discountPct * 1000) / 10).replace(".", ",");
    return next;
  });
  const [free, setFree] = React.useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const line of editOrder?.lines ?? []) if (line.freeQty) next[line.productId] = line.freeQty;
    return next;
  });
  const [extrasOpen, setExtrasOpen] = React.useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const line of editOrder?.lines ?? []) if (line.discountPct || line.freeQty) next[line.productId] = true;
    return next;
  });
  const [email, setEmail] = React.useState("");
  const [extraCustomers, setExtraCustomers] = React.useState<Customer[]>([]);
  const [personOpen, setPersonOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const todayIso = React.useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);
  const todayIsSunday = React.useMemo(() => new Date().getDay() === 0, []);

  const allCustomers = React.useMemo(() => [...extraCustomers, ...customers], [extraCustomers, customers]);
  const customer = allCustomers.find((c) => c.id === customerId) ?? null;
  const emailInit = React.useRef(false);
  React.useEffect(() => {
    // edit mode starts with a customer already chosen: show the e-mail on file once
    if (!emailInit.current && customer) {
      emailInit.current = true;
      setEmail(customer.email ?? "");
    }
  }, [customer]);
  const standing = standingOrders.find((s) => s.customerId === customerId) ?? null;

  /** Selecting a customer replaces the basket with their usual order. */
  function selectCustomer(id: string) {
    setCustomerId(id);
    const s = standingOrders.find((x) => x.customerId === id);
    const next: Record<string, number> = {};
    for (const line of s?.lines ?? []) next[line.productId] = line.quantity;
    setQuantities(next);
    setDiscounts({});
    setFree({});
    setExtrasOpen({});
    const c = allCustomers.find((x) => x.id === id);
    setEmail(c?.email ?? "");
    if (!editOrder) {
      // private persons usually pay on the spot; the person can change it
      setPaymentMethod(c?.kind === "person" ? "gotovina" : "trr");
      if (c?.kind === "person") setPriceList("fizicne");
    }
  }

  function resetToStanding() {
    if (!standing) return;
    const next: Record<string, number> = {};
    for (const line of standing.lines) next[line.productId] = line.quantity;
    setQuantities(next);
    toast("Vrnjeno na običajno naročilo");
  }

  /** Net unit price on the chosen list (private-person prices are shelf prices incl. VAT). */
  const priceNet = (p: Product): number =>
    priceList === "fizicne" && p.retailPriceGross != null
      ? Math.round((p.retailPriceGross / (1 + p.vatRate)) * 10000) / 10000
      : p.unitPriceNet;
  const priceGross = (p: Product): number =>
    priceList === "fizicne" && p.retailPriceGross != null ? p.retailPriceGross : p.unitPriceNet * (1 + p.vatRate);

  // On the private-person list only products with a shelf price can be ordered.
  const visibleProducts = priceList === "fizicne" ? products.filter((p) => p.retailPriceGross != null) : products;

  const pctOf = (id: string) => {
    const n = Number((discounts[id] ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) / 100 : 0;
  };
  const lines = visibleProducts
    .map((p) => ({ product: p, quantity: quantities[p.id] ?? 0, discountPct: pctOf(p.id), freeQty: Math.min(free[p.id] ?? 0, quantities[p.id] ?? 0) }))
    .filter((l) => l.quantity > 0);

  const totalBottles = lines.reduce((s, l) => s + l.quantity, 0);
  const totalCartons = lines.reduce((s, l) => s + l.quantity / l.product.caseSize, 0);
  const cartonsText = Number.isInteger(totalCartons) ? String(totalCartons) : totalCartons.toFixed(1).replace(".", ",");

  const lineNetOf = (l: (typeof lines)[number]) => lineNet({ quantity: l.quantity, unitPriceNet: priceNet(l.product), discountPct: l.discountPct, freeQty: l.freeQty });
  const net = lines.reduce((s, l) => s + lineNetOf(l), 0);
  const vat = lines.reduce((s, l) => s + lineNetOf(l) * l.product.vatRate, 0);
  const discountSum = lines.reduce((s, l) => s + (l.quantity - l.freeQty) * priceNet(l.product) * l.discountPct, 0);
  const giftSum = lines.reduce((s, l) => s + l.freeQty * priceNet(l.product), 0);

  const blocked = Boolean(customer && (customer.creditHold || customer.daysOverdue > 30));

  const customerOptions: ComboboxOption[] = allCustomers.map((c) => ({
    value: c.id,
    label: c.name,
    hint: [c.city, c.deliveryRegion].filter(Boolean).join(" · "),
    meta:
      c.daysOverdue > 0 ? (
        <Badge tone={c.daysOverdue > 30 ? "danger" : "warn"}>{c.daysOverdue} dni</Badge>
      ) : undefined,
  }));

  function submit() {
    if (!customerId || lines.length === 0) return;

    const orderLines = lines.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
      unitPriceNet: priceNet(l.product),
      vatRate: l.product.vatRate,
      discountPct: l.discountPct,
      freeQty: l.freeQty,
    }));

    startTransition(async () => {
      if (editOrder) {
        const result = await updateOrder({
          orderId: editOrder.id,
          deliveryDate,
          note,
          driverId: driverId && driverId !== "__other" ? driverId : null,
          driverName: driverId === "__other" ? driverName.trim() || null : null,
          priceList,
          paymentMethod,
          customerEmail: email.trim() || null,
          lines: orderLines,
        });

        if (!result.ok) {
          toast.error(result.error ?? "Sprememb ni bilo mogoče shraniti");
          return;
        }

        router.push("/pisarna");
        router.refresh();
        return;
      }

      const result = await createOrder({
        customerId,
        deliveryDate,
        note,
        driverId: driverId && driverId !== "__other" ? driverId : null,
        driverName: driverId === "__other" ? driverName.trim() || null : null,
        priceList,
        paymentMethod,
        customerEmail: email.trim() || null,
        lines: orderLines,
        holdForReview: blocked,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Naročila ni bilo mogoče shraniti");
        return;
      }

      // Only worth a message when something unusual happened.
      if (blocked) toast.success(`Naročilo za ${customer?.name} pripravljeno — čaka potrditev pisarne`);
      router.push("/pisarna");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* ---------------------------------------------------- customer */}
      <Card className="p-3.5">
        <FieldLabel>Kupec</FieldLabel>
        {editOrder ? (
          <p className="text-[15px] font-semibold h-11 flex items-center">{customer?.name}</p>
        ) : (
          <Combobox
            options={customerOptions}
            value={customerId}
            onChange={selectCustomer}
            placeholder="— izberi kupca —"
            searchPlaceholder="Ime ali kraj…"
            emptyText="Ni takega kupca."
          />
        )}
        {!editOrder && (
          <button
            type="button"
            onClick={() => setPersonOpen((v) => !v)}
            className="mt-2 text-[12.5px] font-semibold text-wine hover:underline"
          >
            {personOpen ? "Zapri" : "+ Nova fizična oseba"}
          </button>
        )}
        {personOpen && !editOrder && (
          <PersonForm
            onCreated={(c) => {
              setExtraCustomers((x) => [c, ...x]);
              setPersonOpen(false);
              setCustomerId(c.id);
              setQuantities({});
              setDiscounts({});
              setFree({});
              setExtrasOpen({});
              setEmail(c.email ?? "");
              setPaymentMethod("gotovina");
              setPriceList("fizicne");
            }}
          />
        )}
      </Card>

      {!customer && (
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Izberi kupca zgoraj.
            <br />
            Njegovo običajno naročilo se vpiše samo.
          </p>
        </Card>
      )}

      {customer && (
        <>
          {/* ------------------------------------------ overdue warning */}
          {customer.daysOverdue > 0 && (
            <Callout tone={customer.daysOverdue > 30 ? "danger" : "warn"}>
              <strong>
                Odprto {eur(customer.openBalance)}, {customer.daysOverdue} dni v zamudi.
              </strong>
              {blocked && !editOrder
                ? " Naročilo bo shranjeno kot osnutek in ga mora potrditi pisarna."
                : " Pred dostavo se dogovori za plačilo."}
            </Callout>
          )}

          {/* --------------------------------------------- standing order */}
          {standing && standing.lines.length > 0 && (
            <div className="bg-wine-soft border border-wine-border rounded-[12px] p-3 flex gap-2.5 items-start">
              <RotateCw className="size-4 shrink-0 mt-0.5 text-wine" />
              <div className="flex-1 text-[12.5px] leading-relaxed">
                <strong className="text-wine">Običajno naročilo je že vneseno.</strong>
                <br />
                <span className="text-ink-muted">
                  {standing.lastOrderedAt
                    ? `Zadnjič ${dateSl(standing.lastOrderedAt)}. `
                    : ""}
                  Spremeni samo, kar je drugače.
                </span>
              </div>
              <button
                type="button"
                onClick={resetToStanding}
                className="text-[11.5px] font-semibold text-wine hover:underline shrink-0"
              >
                Ponastavi
              </button>
            </div>
          )}

          {/* ---------------------------------------------------- lines */}
          <div className="flex items-center justify-between gap-3 px-1 -mb-1">
            <div
              className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5"
              role="group"
              aria-label="Cenik"
            >
              {(
                [
                  ["gostinci", "Za gostince"],
                  ["fizicne", "Za fizične osebe"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={priceList === key}
                  onClick={() => setPriceList(key)}
                  className={cn(
                    "h-8 px-3 rounded-[8px] text-[12.5px] font-semibold transition-colors",
                    priceList === key ? "bg-wine text-white" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11.5px] text-ink-subtle">
              {priceList === "gostinci" ? "cene brez DDV" : "cene z DDV"}
            </span>
          </div>
          <Card className="px-3.5">
            {visibleProducts.map((p, i) => {
              const qty = quantities[p.id] ?? 0;
              const mode = unitModes[p.id] ?? "case";
              return (
                <div key={p.id} className={i < visibleProducts.length - 1 ? "border-b border-line" : ""}>
                <div className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        "text-sm font-semibold truncate " + (qty > 0 ? "text-wine" : "text-ink")
                      }
                    >
                      {p.name} {p.vintage}
                    </p>
                    <p className="text-[11.5px] text-ink-subtle">
                      {p.volumeL?.toLocaleString("sl-SI")} l · {priceList === "fizicne" ? `${eur(priceGross(p))} z DDV` : `${eur(p.unitPriceNet)} + DDV`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <UnitToggle
                      mode={mode}
                      caseSize={p.caseSize}
                      onChange={(m) => setUnitModes((u) => ({ ...u, [p.id]: m }))}
                    />
                    <Stepper
                      value={qty}
                      step={mode === "case" ? p.caseSize : 1}
                      label={`${p.name} ${p.vintage ?? ""}`}
                      onChange={(v) => setQuantities((q) => ({ ...q, [p.id]: v }))}
                    />
                    {qty > 0 && (
                      <span className="text-[11.5px] font-semibold text-wine tabular">
                        = {inCartons(qty, p.caseSize)}
                      </span>
                    )}
                    {qty > 0 && (
                      <button
                        type="button"
                        onClick={() => setExtrasOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                        className="text-[11.5px] font-semibold text-ink-subtle hover:text-wine"
                      >
                        {extrasOpen[p.id] ? "Skrij popust / gratis" : discounts[p.id] || free[p.id] ? "Popust / gratis ✓" : "+ popust / gratis"}
                      </button>
                    )}
                  </div>
                </div>
                {qty > 0 && extrasOpen[p.id] && (
                  <div className="-mt-1 pb-3 flex flex-wrap items-end gap-3 justify-end">
                    <label className="text-[11px] font-semibold text-ink-subtle">
                      Popust %
                      <Input
                        inputMode="decimal"
                        className="h-10 w-[84px] mt-0.5"
                        value={discounts[p.id] ?? ""}
                        onChange={(e) => setDiscounts((d) => ({ ...d, [p.id]: e.target.value }))}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink-subtle">
                      Gratis (kos)
                      <Input
                        inputMode="numeric"
                        className="h-10 w-[84px] mt-0.5"
                        value={free[p.id] ? String(free[p.id]) : ""}
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(qty, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0));
                          setFree((f) => ({ ...f, [p.id]: n }));
                        }}
                        placeholder="0"
                      />
                    </label>
                  </div>
                )}
                </div>
              );
            })}

            {/* -------------------------------------------------- totals */}
            <div className="border-t-2 border-line mt-1.5 pt-3 pb-3.5">
              {totalBottles > 0 && (
                <Row
                  label="Količina"
                  value={`${steklenice(totalBottles)} = ${cartonsText} ${Number.isInteger(totalCartons) ? kartoni(totalCartons).replace(/^\d+ /, "") : "kartonov"}`}
                />
              )}
              {discountSum > 0 && <Row label="Popust (že odštet)" value={`− ${eur(discountSum)}`} />}
              {giftSum > 0 && <Row label="Gratis (ni zaračunano)" value={`− ${eur(giftSum)}`} />}
              <Row label="Osnova" value={eur(net)} />
              <Row label="DDV 22 %" value={eur(vat)} />
              <div className="flex justify-between items-baseline pt-2 mt-1">
                <span className="text-base font-bold">Skupaj</span>
                <span className="text-base font-bold tabular">{eur(net + vat)}</span>
              </div>
            </div>
          </Card>

          {/* ------------------------------------------ payment + e-mail */}
          <Card className="p-3.5">
            <FieldLabel>Način plačila</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={paymentMethod === m}
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    "h-11 px-3.5 rounded-[var(--radius-control)] border text-sm font-semibold transition-colors",
                    paymentMethod === m ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted hover:border-line-strong",
                  )}
                >
                  {PAYMENT_LABEL[m]}
                </button>
              ))}
            </div>
            {paymentMethod === "gotovina" && (
              <p className="text-[12px] text-ink-muted mt-2">Voznik prejme gotovino ob dostavi; to je vidno na seznamu za tisk in pri dostavi.</p>
            )}

            <FieldLabel className="mt-4">E-naslov za račun in dobavnico</FieldLabel>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ime@podjetje.si"
              className="max-w-[360px]"
            />
            {customer && !customer.email && email.trim() && (
              <p className="text-[11.5px] text-ink-subtle mt-1">Stranka še nima e-naslova: shrani se pri stranki.</p>
            )}
          </Card>

          {/* ---------------------------------------------- date + note */}
          <Card className="p-3.5">
            <FieldLabel>Datum dostave</FieldLabel>
            <div className="flex gap-2 flex-wrap">
              {!todayIsSunday && (
                <button
                  type="button"
                  onClick={() => setDeliveryDate(todayIso)}
                  className={
                    "h-11 px-3.5 rounded-[var(--radius-control)] border text-sm font-semibold transition-colors " +
                    (deliveryDate === todayIso
                      ? "bg-wine text-white border-wine"
                      : "bg-surface border-line text-ink-muted hover:border-line-strong")
                  }
                >
                  Danes
                </button>
              )}
              {deliveryDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeliveryDate(d)}
                  className={
                    "h-11 px-3.5 rounded-[var(--radius-control)] border text-sm font-semibold transition-colors " +
                    (deliveryDate === d
                      ? "bg-wine text-white border-wine"
                      : "bg-surface border-line text-ink-muted hover:border-line-strong")
                  }
                >
                  {new Intl.DateTimeFormat("sl-SI", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).format(new Date(d))}
                </button>
              ))}
            </div>

            <FieldLabel className="mt-3">ali izberi datum</FieldLabel>
            <Input
              type="date"
              value={deliveryDate}
              min={todayIso}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="max-w-[200px]"
            />

            <FieldLabel className="mt-4">Opomba za voznika</FieldLabel>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                customer.deliveryNotes
                  ? `Običajno: ${customer.deliveryNotes}`
                  : "npr. dostava do 10h, vhod zadaj, prevzame Peter"
              }
            />

            <FieldLabel className="mt-4">Voznik (neobvezno)</FieldLabel>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="h-11 w-full max-w-[260px] rounded-[var(--radius-control)] border border-line bg-surface
                         px-3 text-[15px] text-ink"
            >
              <option value="">— še ni določen —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
              <option value="__other">Drugo (vpiši ročno)</option>
            </select>
            {driverId === "__other" && (
              <Input
                className="mt-2 max-w-[260px]"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Kdo bo dostavil?"
              />
            )}
          </Card>

          {/* -------------------------------------------------- submit */}
          <Button
            size="lg"
            onClick={submit}
            loading={pending}
            disabled={lines.length === 0}
            variant={!editOrder && blocked ? "secondary" : "primary"}
          >
            {editOrder ? (
              "Shrani spremembe"
            ) : blocked ? (
              <>
                <AlertTriangle /> Shrani kot osnutek
              </>
            ) : (
              "Potrdi naročilo"
            )}
          </Button>

          <p className="text-[11.5px] text-ink-subtle text-center px-2 pb-2">
            Račun se <strong>ne</strong> izda zdaj. Nastane šele ob potrjeni dostavi — da ni
            dobropisov, če se količina spremeni.
          </p>
        </>
      )}
    </div>
  );
}

function UnitToggle({
  mode,
  caseSize,
  onChange,
}: {
  mode: UnitMode;
  caseSize: number;
  onChange: (mode: UnitMode) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-control)] border border-line overflow-hidden text-[10.5px] font-semibold leading-none">
      <button
        type="button"
        onClick={() => onChange("piece")}
        aria-pressed={mode === "piece"}
        className={cn(
          "h-6 px-2 transition-colors",
          mode === "piece"
            ? "bg-wine text-white"
            : "bg-surface text-ink-subtle hover:bg-surface-muted",
        )}
      >
        kos
      </button>
      <button
        type="button"
        onClick={() => onChange("case")}
        aria-pressed={mode === "case"}
        className={cn(
          "h-6 px-2 transition-colors border-l border-line",
          mode === "case"
            ? "bg-wine text-white"
            : "bg-surface text-ink-subtle hover:bg-surface-muted",
        )}
      >
        karton × {caseSize}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13.5px] py-0.5 text-ink-muted">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}


/** Quick entry of a private person (fizična oseba) so an order can be taken for someone who is not a company. */
function PersonForm({ onCreated }: { onCreated: (c: Customer) => void }) {
  const [f, setF] = React.useState({ firstName: "", lastName: "", address: "", postCode: "", city: "", phone: "", email: "" });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.firstName.trim() || !f.lastName.trim()) return void toast.error("Vpiši ime in priimek.");
    if (!f.address.trim() || !f.city.trim()) return void toast.error("Vpiši naslov in kraj.");
    if (!f.phone.trim() && !f.email.trim()) return void toast.error("Vpiši telefon ali e-naslov.");
    setBusy(true);
    const r = await createPersonCustomer(f);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    onCreated({
      id: r.customerId,
      name: r.name,
      city: f.city.trim(),
      address: f.address.trim(),
      deliveryRegion: null,
      deliveryNotes: null,
      paymentTermsDays: 0,
      openBalance: 0,
      daysOverdue: 0,
      creditHold: false,
      kind: "person",
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
    });
  }

  return (
    <div className="mt-3 rounded-[var(--radius-control)] border border-line p-3 space-y-2">
      <p className="text-[12.5px] font-semibold">Nova fizična oseba</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Ime" value={f.firstName} onChange={set("firstName")} autoComplete="off" />
        <Input placeholder="Priimek" value={f.lastName} onChange={set("lastName")} autoComplete="off" />
      </div>
      <Input placeholder="Naslov (ulica in številka)" value={f.address} onChange={set("address")} autoComplete="off" />
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <Input placeholder="Pošta" inputMode="numeric" value={f.postCode} onChange={set("postCode")} autoComplete="off" />
        <Input placeholder="Kraj" value={f.city} onChange={set("city")} autoComplete="off" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Telefon" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="off" />
        <Input placeholder="E-naslov" type="email" inputMode="email" value={f.email} onChange={set("email")} autoComplete="off" />
      </div>
      <Button size="sm" loading={busy} onClick={save}>
        Shrani osebo
      </Button>
    </div>
  );
}
