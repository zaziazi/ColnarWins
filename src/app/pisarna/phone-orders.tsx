"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { dateShort, eur } from "@/lib/format";
import type { DayState } from "@/lib/delivery-days";
import type { Driver, OrderListItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { confirmOrders } from "./actions";
import { DayConfirm } from "./day-confirm";
import { DeleteDelivered } from "./delete-delivered";
import { DeliveryDocs } from "./delivery-docs";
import { DriverAssign } from "./driver-assign";
import { MoneyDialog, OrderMoney } from "./order-money";
import { OrderActions } from "./order-actions";

const SOURCE_LABEL: Record<string, string> = {
  phone: "telefon",
  email: "e-pošta",
  standing: "stalno naročilo",
  field: "teren",
  manual: "ročno",
  webshop: "spletna trgovina",
};

interface DayGroup {
  date: string | null;
  orders: OrderListItem[];
  state: DayState | null;
  noDriver: number;
}

/**
 * The phone list of orders by day. "Izberi" turns on tick boxes so several orders can be confirmed,
 * marked "račun izdan" or "plačano" in one go.
 */
export function PhoneOrders({
  drafts,
  days,
  done,
  drivers,
  today,
}: {
  drafts: OrderListItem[];
  days: DayGroup[];
  done: OrderListItem[];
  drivers: Driver[];
  today: string;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [moneyOpen, setMoneyOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const all = [...drafts, ...days.flatMap((d) => d.orders), ...done];
  const pickedOrders = all.filter((o) => picked.has(o.id));
  const pickedDrafts = pickedOrders.filter((o) => o.status === "draft");

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stop = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  async function confirmPicked() {
    setBusy(true);
    const r = await confirmOrders(pickedDrafts.map((o) => o.id));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (r.skipped > 0) toast.error(`Potrjenih ${r.confirmed}, preskočenih ${r.skipped}.`);
    stop();
    router.refresh();
  }

  const card = (o: OrderListItem, highlight?: boolean) => (
    <OrderCard key={o.id} order={o} drivers={drivers} highlight={highlight} selecting={selecting} picked={picked.has(o.id)} onToggle={() => toggle(o.id)} />
  );

  return (
    <div className={selecting ? "pb-28" : undefined}>
      {all.length > 0 && (
        <div className="flex justify-end mb-3 -mt-1">
          <Button size="sm" variant={selecting ? "secondary" : "ghost"} onClick={() => (selecting ? stop() : setSelecting(true))}>
            {selecting ? "Končaj izbiranje" : "Izberi naročila"}
          </Button>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <SectionHeading>Čaka na potrditev</SectionHeading>
          <div className="space-y-2.5 mb-6">{drafts.map((o) => card(o, true))}</div>
        </>
      )}

      {days.length === 0 && drafts.length === 0 && (
        <Card className="p-5 text-center mb-6">
          <p className="text-[13px] text-ink-muted">Ni odprtih naročil.</p>
        </Card>
      )}

      {days.map((day) => (
        <div key={day.date ?? "brez"} className="mb-6">
          <DayHeading date={day.date} today={today} count={day.orders.length} state={day.state ?? undefined} noDriver={day.noDriver} />
          <div className="space-y-2.5">{day.orders.map((o) => card(o))}</div>
        </div>
      ))}

      {done.length > 0 && (
        <details className="mb-6" open={selecting || undefined}>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
            Dostavljena ({done.length})
          </summary>
          <div className="space-y-2.5 mt-2.5">{done.map((o) => card(o))}</div>
        </details>
      )}

      {selecting && (
        <div className="fixed bottom-[60px] inset-x-0 z-20 mx-auto w-full max-w-[520px] bg-surface border-t border-line px-3 py-2.5 flex items-center gap-2 shadow-lg">
          <span className="text-[12.5px] font-semibold text-ink-muted mr-auto">Izbrano: {picked.size}</span>
          <Button size="sm" variant="secondary" disabled={pickedOrders.length === 0} onClick={() => setMoneyOpen(true)}>
            Račun / plačilo
          </Button>
          <Button size="sm" disabled={pickedDrafts.length === 0} loading={busy} onClick={() => void confirmPicked()}>
            Potrdi ({pickedDrafts.length})
          </Button>
        </div>
      )}
      <MoneyDialog orders={pickedOrders} open={moneyOpen} onOpenChange={setMoneyOpen} onDone={stop} />
    </div>
  );
}

function DayHeading({
  date,
  today,
  count,
  state,
  noDriver,
}: {
  date: string | null;
  today: string;
  count: number;
  state?: DayState;
  noDriver: number;
}) {
  if (!date) {
    return <SectionHeading>Brez datuma dostave · {count}</SectionHeading>;
  }
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const label = dateShort(new Date(`${date}T12:00:00`));
  const prefix = date === today ? "Danes · " : date === tomorrowIso ? "Jutri · " : "";
  const overdue = date < today;

  const word = date === today ? "danes" : date === tomorrowIso ? "jutri" : null;

  return (
    <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
      <h2
        className={
          "text-xs font-bold uppercase tracking-[0.06em] " + (overdue ? "text-danger" : "text-ink-subtle")
        }
      >
        {prefix}
        {label}
        {overdue && " · zamuja"} · {count}
      </h2>
      <DayConfirm date={date} word={word} confirmed={state?.confirmed ?? false} printed={state?.printed ?? false} noDriver={noDriver} />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
      {children}
    </h2>
  );
}

function OrderCard({
  order,
  drivers,
  highlight,
  selecting,
  picked,
  onToggle,
}: {
  order: OrderListItem;
  drivers: Driver[];
  highlight?: boolean;
  selecting?: boolean;
  picked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <Card className={cn(highlight ? "border-warn/30 bg-warn-soft/30" : undefined, picked && "border-wine")}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          {selecting && order.status !== "cancelled" && (
            <input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={picked} onChange={onToggle} aria-label={`Izberi #${order.orderNumber}`} />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px] truncate">{order.customerName}</h3>
            <p className="text-[11.5px] text-ink-subtle mt-0.5">
              #{order.orderNumber} · {SOURCE_LABEL[order.source] ?? order.source}
              {order.deliveryDate && ` · dostava ${dateShort(order.deliveryDate)}`}
              {order.createdByName && ` · vnesel/a ${order.createdByName}`}
              {order.priceList === "fizicne" && " · cene za fizične osebe"}
            </p>
            {order.reviewNote && order.status === "draft" && (
              <p className="text-[12px] text-warn font-semibold mt-1">{order.reviewNote}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge tone={statusTone[order.status]}>{statusLabel[order.status]}</Badge>
            {(order.status === "draft" || order.status === "confirmed") && (
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-[11.5px] gap-1"
              >
                <Link href={`/pisarna/${order.id}/uredi`}>
                  <Pencil className="size-3" /> Uredi
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2">
          <OrderActions orderId={order.id} status={order.status} />
        </div>

        <OrderMoney order={order} />

        <p className="text-[12.5px] text-ink-muted mt-2.5 leading-relaxed">{order.lineSummary}</p>
        <div className="flex items-end justify-between mt-1.5">
          <p className="text-[13px] font-semibold tabular">{eur(order.totalGross)}</p>
          <div className="text-right">
            <FieldLabel className="mb-1">Voznik</FieldLabel>
            {order.routedDriverName || (order.assignedDriverName && !order.assignedDriverId) ? (
              <p className="text-[12.5px] font-medium text-ink-muted h-7 flex items-center justify-end">
                {order.routedDriverName ?? order.assignedDriverName}
              </p>
            ) : (
              <DriverAssign
                orderId={order.id}
                drivers={drivers}
                assignedDriverId={order.assignedDriverId}
              />
            )}
          </div>
        </div>
        {order.mail && <DeliveryDocs orderId={order.id} mail={order.mail} />}
        {(order.status === "delivered" || order.status === "invoiced") && (
          <DeleteDelivered orderId={order.id} hasReceipt={order.status === "invoiced"} />
        )}
      </div>
    </Card>
  );
}
