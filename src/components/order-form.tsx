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
import { eur, dateSl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer, Product, StandingOrder, StandingOrderLine } from "@/lib/types";
import { createOrder } from "@/app/pisarna/novo/actions";
import { updateOrder } from "@/app/pisarna/actions";

type UnitMode = "piece" | "case";

interface EditOrder {
  id: string;
  customerId: string;
  deliveryDate: string | null;
  note: string;
  lines: StandingOrderLine[];
}

interface Props {
  customers: Customer[];
  products: Product[];
  standingOrders: StandingOrder[];
  /** Next few plausible delivery dates, computed on the server. */
  deliveryDates: string[];
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
  const [pending, startTransition] = React.useTransition();

  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekAheadIso = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const standing = standingOrders.find((s) => s.customerId === customerId) ?? null;

  /** Selecting a customer replaces the basket with their usual order. */
  function selectCustomer(id: string) {
    setCustomerId(id);
    const s = standingOrders.find((x) => x.customerId === id);
    const next: Record<string, number> = {};
    for (const line of s?.lines ?? []) next[line.productId] = line.quantity;
    setQuantities(next);
  }

  function resetToStanding() {
    if (!standing) return;
    const next: Record<string, number> = {};
    for (const line of standing.lines) next[line.productId] = line.quantity;
    setQuantities(next);
    toast("Vrnjeno na običajno naročilo");
  }

  const lines = products
    .map((p) => ({ product: p, quantity: quantities[p.id] ?? 0 }))
    .filter((l) => l.quantity > 0);

  const net = lines.reduce((s, l) => s + l.quantity * l.product.unitPriceNet, 0);
  const vat = lines.reduce(
    (s, l) => s + l.quantity * l.product.unitPriceNet * l.product.vatRate,
    0,
  );

  const blocked = Boolean(customer && (customer.creditHold || customer.daysOverdue > 30));

  const customerOptions: ComboboxOption[] = customers.map((c) => ({
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
      unitPriceNet: l.product.unitPriceNet,
      vatRate: l.product.vatRate,
    }));

    startTransition(async () => {
      if (editOrder) {
        const result = await updateOrder({
          orderId: editOrder.id,
          deliveryDate,
          note,
          lines: orderLines,
        });

        if (!result.ok) {
          toast.error(result.error ?? "Sprememb ni bilo mogoče shraniti");
          return;
        }

        toast.success(`Naročilo za ${customer?.name} posodobljeno`);
        router.push("/pisarna");
        router.refresh();
        return;
      }

      const result = await createOrder({
        customerId,
        deliveryDate,
        note,
        lines: orderLines,
        holdForReview: blocked,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Naročila ni bilo mogoče shraniti");
        return;
      }

      toast.success(
        blocked
          ? `Naročilo za ${customer?.name} pripravljeno — čaka potrditev pisarne`
          : `Naročilo za ${customer?.name} potrjeno · dobavnica pripravljena`,
      );
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
          <Card className="px-3.5">
            {products.map((p, i) => {
              const qty = quantities[p.id] ?? 0;
              const mode = unitModes[p.id] ?? "case";
              return (
                <div
                  key={p.id}
                  className={
                    "flex items-center gap-3 py-2.5" +
                    (i < products.length - 1 ? " border-b border-line" : "")
                  }
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        "text-sm font-semibold truncate " + (qty > 0 ? "text-wine" : "text-ink")
                      }
                    >
                      {p.name} {p.vintage}
                    </p>
                    <p className="text-[11.5px] text-ink-subtle">
                      {p.volumeL?.toLocaleString("sl-SI")} l · {eur(p.unitPriceNet)}
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
                  </div>
                </div>
              );
            })}

            {/* -------------------------------------------------- totals */}
            <div className="border-t-2 border-line mt-1.5 pt-3 pb-3.5">
              <Row label="Osnova" value={eur(net)} />
              <Row label="DDV 22 %" value={eur(vat)} />
              <div className="flex justify-between items-baseline pt-2 mt-1">
                <span className="text-base font-bold">Skupaj</span>
                <span className="text-base font-bold tabular">{eur(net + vat)}</span>
              </div>
            </div>
          </Card>

          {/* ---------------------------------------------- date + note */}
          <Card className="p-3.5">
            <FieldLabel>Datum dostave</FieldLabel>
            <div className="flex gap-2 flex-wrap">
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
              <button
                type="button"
                onClick={() => setDeliveryDate(weekAheadIso)}
                className={
                  "h-11 px-3.5 rounded-[var(--radius-control)] border text-sm font-semibold transition-colors " +
                  (deliveryDate === weekAheadIso
                    ? "bg-wine text-white border-wine"
                    : "bg-surface border-line text-ink-muted hover:border-line-strong")
                }
              >
                Čez teden dni
              </button>
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
