"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Check, CheckCheck, HandHelping, Pencil, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import { dateShort, eur } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { markOrdersPaid } from "@/app/pisarna/actions";
import type { DayOrder, DeliveryDay } from "@/lib/delivery-days";
import { dismissCancelled } from "@/app/tisk/actions";
import { recordBreakage, setDelivered, takeOrders } from "./actions";

type View = "mine" | "all";

const isDone = (o: DayOrder) => o.lines.length > 0 && o.lines.every((l) => l.delivered);
const unassigned = (o: DayOrder) => !o.driverId && !o.driverName;

/**
 * Today's deliveries, split by driver. A driver sees their own orders and the ones nobody has taken
 * yet ("Prevzemam"); "Vsi" shows the whole day grouped by driver. Ticking another driver's order asks
 * first, because swaps on the road happen. Taps apply instantly and are saved in the background.
 */
export function DeliveryList({
  day: initial,
  date,
  canEdit = true,
  meId,
}: {
  day: DeliveryDay | null;
  date: string;
  canEdit?: boolean;
  meId: string | null;
}) {
  const router = useRouter();
  const [day, setDay] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [breakageFor, setBreakageFor] = React.useState<string | null>(null);

  React.useEffect(() => setDay(initial), [initial]);

  async function cashReceived(order: DayOrder) {
    if (!window.confirm(`Prejeto ${eur(order.totalGross)} v gotovini od ${order.customerName}?`)) return;
    setDay((d) => (d ? { ...d, orders: d.orders.map((o) => (o.orderId === order.orderId ? { ...o, paidAt: new Date().toISOString() } : o)) } : d));
    const r = await markOrdersPaid({ orderIds: [order.orderId], method: "gotovina", waiveInvoice: false });
    if (!r.ok) {
      toast.error(r.error);
      router.refresh();
    }
  }

  const orders = day?.orders ?? [];
  const active = orders.filter((o) => !o.cancelled);
  const mine = active.filter((o) => meId && o.driverId === meId);
  const free = active.filter(unassigned);
  const others = active.filter((o) => !unassigned(o) && !(meId && o.driverId === meId));

  // People who drive today see their own list first; everybody else (office, owner) starts with the whole day.
  const [view, setView] = React.useState<View>("mine");
  const effectiveView: View = mine.length === 0 && free.length === 0 && others.length > 0 ? "all" : view;

  function patchOrder(orderId: string, productId: string | undefined, delivered: boolean) {
    setDay((d) =>
      d
        ? {
            ...d,
            orders: d.orders.map((o) =>
              o.orderId !== orderId
                ? o
                : { ...o, lines: o.lines.map((l) => (!productId || l.productId === productId ? { ...l, delivered } : l)) },
            ),
          }
        : d,
    );
  }

  async function toggle(order: DayOrder, productId: string | undefined, delivered: boolean) {
    // someone else's order: confirm, a swap on the road is normal but should be deliberate
    if (delivered && order.driverId && meId && order.driverId !== meId) {
      if (!window.confirm(`To naročilo je dodeljeno: ${order.driverName ?? "drugi voznik"}. Vseeno označim kot dostavljeno?`)) return;
    }
    const before = day;
    patchOrder(order.orderId, productId, delivered);
    const res = await setDelivered({ orderId: order.orderId, delivered, productId });
    if (!res.ok) {
      setDay(before);
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function take(ids: string[]) {
    setBusy(true);
    const res = await takeOrders(ids);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  }

  if (!day || orders.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted">Za danes ni potrjenih naročil za dostavo.</p>
      </Card>
    );
  }

  const totalDone = active.filter(isDone).length;
  const showMineCounter = effectiveView === "mine" && mine.length > 0;
  const counterDone = showMineCounter ? mine.filter(isDone).length : totalDone;
  const counterTotal = showMineCounter ? mine.length : active.length;
  const pct = counterTotal > 0 ? Math.round((counterDone / counterTotal) * 100) : 0;

  // what is still to load for the orders I carry
  const toLoad = new Map<string, { name: string; n: number }>();
  for (const o of mine) {
    for (const l of o.lines) {
      if (l.delivered) continue;
      const cur = toLoad.get(l.productId) ?? { name: l.productName, n: 0 };
      cur.n += l.quantity;
      toLoad.set(l.productId, cur);
    }
  }

  // groups shown below the counter
  const groups: { key: string; title: string; orders: DayOrder[]; canTake: boolean }[] = [];
  if (effectiveView === "mine") {
    if (mine.length > 0) groups.push({ key: "mine", title: "Moja naročila", orders: mine, canTake: false });
    if (free.length > 0) groups.push({ key: "free", title: "Brez voznika", orders: free, canTake: true });
  } else {
    if (free.length > 0) groups.push({ key: "free", title: "Brez voznika", orders: free, canTake: true });
    const byDriver = new Map<string, DayOrder[]>();
    for (const o of active.filter((x) => !unassigned(x))) {
      const k = o.driverId ?? `name:${o.driverName}`;
      byDriver.set(k, [...(byDriver.get(k) ?? []), o]);
    }
    const sorted = [...byDriver.entries()].sort(([ka, a], [kb, b]) => {
      if (meId && ka === meId) return -1;
      if (meId && kb === meId) return 1;
      return (a[0].driverName ?? "").localeCompare(b[0].driverName ?? "", "sl");
    });
    for (const [k, list] of sorted) {
      groups.push({
        key: k,
        title: meId && k === meId ? "Moja naročila" : (list[0].driverName ?? "Drugo"),
        orders: list,
        canTake: false,
      });
    }
  }
  const cancelled = orders.filter((o) => o.cancelled);

  const renderOrder = (order: DayOrder, i: number) => {
    const all = isDone(order);
    const foreign = Boolean(order.driverId && meId && order.driverId !== meId);
    return (
      <Card key={order.orderId} className={cn("p-3.5", all && "bg-surface-muted")}>
        <div className="flex items-start gap-3">
          <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0 pt-1">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn("font-semibold text-[15px]", all && "line-through text-ink-subtle")}>{order.customerName}</h3>
              {order.addedAfterConfirm ? <Badge tone="info">Novo</Badge> : null}
            </div>
            <p className="text-[11.5px] text-ink-subtle mt-0.5">
              #{order.orderNumber}
              {[order.address, order.city].filter(Boolean).length > 0 && ` · ${[order.address, order.city].filter(Boolean).join(", ")}`}
              {order.deliveryNotes && ` · ${order.deliveryNotes}`}
              {effectiveView === "all" && order.driverName && ` · voznik ${order.driverName}`}
            </p>
            {order.driverNote && <p className="text-[12px] text-warn font-medium mt-1">{order.driverNote}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {order.paidAt ? (
                <Badge tone="good">Plačano</Badge>
              ) : order.paymentMethod === "gotovina" ? (
                <Badge tone="warn">Gotovina ob dostavi · {eur(order.totalGross)}</Badge>
              ) : order.paymentMethod === "kartica" ? (
                <Badge tone="neutral">Kartica</Badge>
              ) : null}
              {order.changedAfterPrint ? (
                <Badge tone="warn">Spremenjeno po tisku</Badge>
              ) : order.printSentAt ? (
                <Badge tone="good">Poslano v tisk</Badge>
              ) : (
                <Badge tone="neutral">Še ni v tisku</Badge>
              )}
            </div>
          </div>
        </div>

        <ul className="mt-2.5 divide-y divide-line">
          {order.lines.map((l) => (
            <li key={l.productId}>
              <button
                type="button"
                onClick={() => void toggle(order, l.productId, !l.delivered)}
                className="w-full flex items-center gap-3 py-2.5 text-left"
              >
                <span
                  className={cn(
                    "size-6 shrink-0 grid place-items-center rounded-[6px] border",
                    l.delivered ? "bg-good border-good text-white" : "border-line-strong bg-surface",
                  )}
                >
                  {l.delivered && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className={cn("flex-1 text-[14.5px]", l.delivered && "line-through text-ink-subtle")}>
                  {l.productName}
                  {l.freeQty > 0 && <span className="ml-1.5 text-[11.5px] font-semibold text-wine">od tega {l.freeQty} gratis</span>}
                  {l.discountPct > 0 && <span className="ml-1.5 text-[11.5px] font-semibold text-ink-subtle">popust {Math.round(l.discountPct * 1000) / 10} %</span>}
                </span>
                <span className={cn("tabular font-bold text-[15px]", l.delivered && "line-through text-ink-subtle")}>{l.quantity}×</span>
              </button>
            </li>
          ))}
        </ul>

        {order.lines.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {all ? (
              <Button variant="secondary" size="sm" onClick={() => void toggle(order, undefined, false)}>
                <Undo2 className="size-3.5" /> Razveljavi
              </Button>
            ) : (
              <>
                <Button size="sm" variant={foreign ? "secondary" : "primary"} onClick={() => void toggle(order, undefined, true)}>
                  <CheckCheck className="size-3.5" /> Vse dostavljeno
                </Button>
                {canEdit && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/pisarna/${order.orderId}/uredi`}>
                      <Pencil className="size-3.5" /> Uredi
                    </Link>
                  </Button>
                )}
              </>
            )}
            {order.paymentMethod === "gotovina" && !order.paidAt && (
              <Button size="sm" variant="secondary" onClick={() => void cashReceived(order)}>
                <Banknote className="size-3.5" /> Prejel gotovino
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setBreakageFor(breakageFor === order.orderId ? null : order.orderId)}>
              Razbito
            </Button>
            {unassigned(order) && !all && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void take([order.orderId])}>
                <HandHelping className="size-3.5" /> Prevzemam
              </Button>
            )}
          </div>
        )}
        {breakageFor === order.orderId && <BreakagePanel order={order} onClose={() => setBreakageFor(null)} />}
      </Card>
    );
  };

  return (
    <div>
      <Card className="p-4 mb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
              Danes · {dateShort(new Date(`${date}T12:00:00`))}
              {showMineCounter && " · moje dostave"}
            </p>
            <p className="mt-1 text-[26px] leading-none font-bold tabular tracking-[-0.02em]">
              {counterDone}
              <span className="text-ink-subtle font-semibold"> / {counterTotal}</span>
            </p>
            <p className="text-[12px] text-ink-muted mt-1">
              {counterDone === counterTotal ? "Vse dostavljeno" : "dostav opravljenih"}
              {showMineCounter && ` · cel dan ${totalDone} / ${active.length}`}
            </p>
          </div>
          {counterDone === counterTotal && <Badge tone="good">Končano</Badge>}
        </div>
        <div className="mt-3 h-2 rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full bg-good transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5 mb-4" role="group" aria-label="Pogled">
        {(
          [
            ["mine", `Moje${mine.length ? ` (${mine.length})` : ""}`],
            ["all", `Vsi (${active.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={effectiveView === key}
            onClick={() => setView(key)}
            className={cn(
              "h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold transition-colors",
              effectiveView === key ? "bg-wine text-white" : "text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!day.confirmedAt && (
        <Callout tone="warn" className="mb-4">
          Ta dan še ni potrjen v zavihku Naročila, zato tudi ni v Tisku.
        </Callout>
      )}

      {toLoad.size > 0 && effectiveView === "mine" && (
        <Card className="p-3.5 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle mb-1.5">Naloži v avto</p>
          <p className="text-[13.5px] leading-relaxed">
            {[...toLoad.values()].map((l) => `${l.n}× ${l.name}`).join(" · ")}
          </p>
        </Card>
      )}

      {effectiveView === "mine" && others.length > 0 && (
        <p className="text-[12px] text-ink-subtle mb-3">
          {others.length} {others.length === 1 ? "naročilo ima" : "naročil imajo"} drugi vozniki. Za pregled tapni »Vsi«.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">
              {g.title} · {g.orders.filter(isDone).length}/{g.orders.length}
            </h2>
            {g.canTake && g.orders.length > 1 && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => void take(g.orders.map((o) => o.orderId))}>
                <HandHelping className="size-3.5" /> Prevzemam vse ({g.orders.length})
              </Button>
            )}
          </div>
          <div className="space-y-2.5">{g.orders.map((o, i) => renderOrder(o, i))}</div>
        </section>
      ))}

      {cancelled.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Preklicano</h2>
          <div className="space-y-2.5">
            {cancelled.map((o) => (
              <Card key={o.orderId} className="p-3.5 bg-surface-muted">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[15px] line-through text-ink-subtle">{o.customerName}</h3>
                    <p className="text-[11.5px] text-ink-subtle mt-0.5">#{o.orderNumber}</p>
                  </div>
                  <Badge tone="danger">Preklicano</Badge>
                </div>
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const res = await dismissCancelled(o.orderId);
                      if (!res.ok) return void toast.error(res.error);
                      router.refresh();
                    }}
                  >
                    Odstrani
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


/** Broken bottles: pick the wine, how many, and it is written off the stock with the order and customer as the reason. */
function BreakagePanel({ order, onClose }: { order: DayOrder; onClose: () => void }) {
  const [productId, setProductId] = React.useState(order.lines[0]?.productId ?? "");
  const [qty, setQty] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    const n = parseInt(qty, 10);
    if (!productId || !(n > 0)) return void toast.error("Vpišite količino.");
    setBusy(true);
    const r = await recordBreakage({ orderId: order.orderId, productId, qty: n, note });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    onClose();
  }

  return (
    <div className="mt-2.5 rounded-[var(--radius-control)] border border-line p-3 space-y-2">
      <p className="text-[12.5px] font-semibold">Razbite steklenice (odpis iz zaloge)</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[14px]"
          aria-label="Vino"
        >
          {order.lines.map((l) => (
            <option key={l.productId} value={l.productId}>
              {l.productName}
            </option>
          ))}
        </select>
        <Input inputMode="numeric" className="h-10 w-[72px]" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} aria-label="Količina" />
      </div>
      <Input className="h-10" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opomba (neobvezno)" />
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={() => void save()}>
          Odpiši
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Zapri
        </Button>
      </div>
    </div>
  );
}
