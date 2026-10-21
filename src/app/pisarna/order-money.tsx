"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PAYMENT_LABEL, type OrderListItem, type PaymentMethod } from "@/lib/types";
import { markInvoiced, markOrdersPaid, unmarkInvoiced, unmarkOrderPaid } from "./actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("sl-SI", { day: "numeric", month: "numeric" });

/** The small tags that say how an order is paid and whether its invoice exists. */
export function MoneyBadges({ order }: { order: OrderListItem }) {
  const method = order.paymentMethod ?? "trr";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {method !== "trr" && !order.paidAt && <Badge tone={method === "gotovina" ? "warn" : "neutral"}>{PAYMENT_LABEL[method]}</Badge>}
      {order.paidAt && <Badge tone="good">Plačano {day(order.paidAt)} · {PAYMENT_LABEL[method].split(" ")[0]}</Badge>}
      {order.invoiceWaived ? (
        <Badge tone="danger">Brez računa</Badge>
      ) : order.status === "invoiced" ? (
        <Badge tone="neutral">Račun izdan{order.invoiceNumber ? ` · ${order.invoiceNumber}` : ""}</Badge>
      ) : order.status === "delivered" ? (
        <Badge tone="warn">Račun ni izdan</Badge>
      ) : null}
    </div>
  );
}

/** Tags plus one button that opens the invoice / payment marks for this order. */
export function OrderMoney({ order, compact = false }: { order: OrderListItem; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (order.status === "draft" || order.status === "cancelled") return null;
  return (
    <div className={compact ? "flex flex-col items-start gap-1.5" : "mt-2 flex flex-wrap items-center gap-2"} onClick={(e) => e.stopPropagation()}>
      <MoneyBadges order={order} />
      <Button size="sm" variant="secondary" className="h-7 px-2 text-[11.5px]" onClick={() => setOpen(true)}>
        Račun / plačilo
      </Button>
      <MoneyDialog orders={[order]} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Invoice and payment marks for one or several orders.
 * "Račun izdan" is only for delivered orders (the invoice follows the delivery);
 * "Plačano" works for anything confirmed, which is what a driver needs when he takes cash at the door.
 */
export function MoneyDialog({
  orders,
  open,
  onOpenChange,
  onDone,
}: {
  orders: OrderListItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const single = orders.length === 1 ? orders[0] : null;
  const [number, setNumber] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(single?.paymentMethod ?? "gotovina");
  const [waive, setWaive] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, start] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setNumber(single?.invoiceNumber ?? "");
      setMethod(single?.paymentMethod && single.paymentMethod !== "trr" ? single.paymentMethod : "gotovina");
      setWaive(false);
      setNote("");
    }
  }, [open, single]);

  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const unpaid = orders.filter((o) => !o.paidAt && o.status !== "draft" && o.status !== "cancelled");

  function run(fn: () => Promise<{ ok: boolean; error?: string; done?: number; skipped?: number }>, closeAfter = true) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Napaka");
      if (r.skipped) toast.error(`Označenih ${r.done}, preskočenih ${r.skipped}.`);
      if (closeAfter) onOpenChange(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={single ? `#${single.orderNumber} · ${single.customerName}` : `${orders.length} naročil`}>
        <div className="space-y-5">
          <section>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Račun</p>
            {single?.status === "invoiced" ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[13.5px]">Račun izdan{single.invoiceNumber ? ` · št. ${single.invoiceNumber}` : ""}.</p>
                <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => unmarkInvoiced(single.id))}>
                  Odstrani oznako
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {single && <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Številka računa (neobvezno)" />}
                <Button
                  size="sm"
                  loading={busy}
                  disabled={deliveredCount === 0}
                  onClick={() => run(() => markInvoiced(orders.map((o) => o.id), single ? number : null))}
                >
                  Račun je izdan{deliveredCount !== orders.length && !single ? ` (${deliveredCount})` : ""}
                </Button>
                {deliveredCount === 0 && <p className="text-[12px] text-ink-subtle">Račun se označi, ko je naročilo dostavljeno.</p>}
              </div>
            )}
          </section>

          <section>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Plačilo</p>
            {single?.paidAt ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[13.5px]">
                  Plačano {day(single.paidAt)} ({PAYMENT_LABEL[single.paymentMethod ?? "trr"]})
                  {single.invoiceWaived ? ` · brez računa: ${single.invoiceWaivedNote ?? ""}` : ""}
                </p>
                <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => unmarkOrderPaid(single.id))}>
                  Odstrani oznako
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => setMethod(m)}
                      className={
                        "h-9 px-3 rounded-[var(--radius-control)] border text-[13px] font-semibold " +
                        (method === m ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")
                      }
                    >
                      {PAYMENT_LABEL[m]}
                    </button>
                  ))}
                </div>
                {method === "gotovina" && (
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className="mt-1" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
                    <span>
                      Gotovina <b>brez računa</b>
                      <span className="block text-[11.5px] text-ink-subtle">
                        Pri gotovini naj račun izda blagajna. Brez računa samo, če vam to potrjuje računovodja.
                      </span>
                    </span>
                  </label>
                )}
                {waive && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Razlog (obvezno), npr. vzorec, darilo, račun na blagajni" />}
                <Button
                  size="sm"
                  loading={busy}
                  disabled={unpaid.length === 0 || (waive && note.trim().length < 3)}
                  onClick={() => run(() => markOrdersPaid({ orderIds: unpaid.map((o) => o.id), method, waiveInvoice: waive && method === "gotovina", note }))}
                >
                  Plačano{!single ? ` (${unpaid.length})` : ""}
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
