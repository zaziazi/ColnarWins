"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Search } from "lucide-react";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dateShort, eur } from "@/lib/format";
import type { OrderListItem, OrderStatus } from "@/lib/types";
import { confirmOrders } from "./actions";
import { MoneyDialog, OrderMoney } from "./order-money";

const SOURCE: Record<string, string> = {
  phone: "telefon",
  email: "e-pošta",
  standing: "stalno",
  field: "teren",
  manual: "ročno",
  webshop: "splet",
};

const selectCls = "h-10 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px]";

/**
 * The laptop view of the order list: one table, filters, and "confirm several drafts at once".
 * (Phones keep the card list.)
 */
export function OrdersTable({ orders }: { orders: OrderListItem[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"" | OrderStatus>("");
  const [driver, setDriver] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [moneyOpen, setMoneyOpen] = React.useState(false);

  const driverOf = (o: OrderListItem) => o.routedDriverName ?? o.assignedDriverName ?? "";
  const drivers = [...new Set(orders.map(driverOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sl"));

  const rows = orders.filter((o) => {
    if (status && o.status !== status) return false;
    if (driver === "__none" ? driverOf(o) !== "" || o.assignedDriverId : driver && driverOf(o) !== driver) return false;
    const t = q.trim().toLowerCase();
    return !t || o.customerName.toLowerCase().includes(t) || String(o.orderNumber) === t.replace("#", "");
  });

  const selectable = rows.filter((o) => o.status !== "cancelled");
  const allPicked = selectable.length > 0 && selectable.every((o) => picked.has(o.id));
  const pickedOrders = orders.filter((o) => picked.has(o.id));
  const pickedDrafts = pickedOrders.filter((o) => o.status === "draft");

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function confirmPicked() {
    setBusy(true);
    const r = await confirmOrders(pickedDrafts.map((o) => o.id));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setPicked(new Set());
    if (r.skipped > 0) toast.error(`Potrjenih ${r.confirmed}, preskočenih ${r.skipped}.`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-[280px]">
          <Search className="size-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kupec ali št. naročila" className="pl-9" />
        </div>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as "" | OrderStatus)} aria-label="Status">
          <option value="">Vsi statusi</option>
          {(["draft", "confirmed", "planned", "delivered", "invoiced"] as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
        <select className={selectCls} value={driver} onChange={(e) => setDriver(e.target.value)} aria-label="Voznik">
          <option value="">Vsi vozniki</option>
          <option value="__none">Brez voznika</option>
          {drivers.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-ink-subtle">{rows.length} naročil</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={pickedOrders.length === 0} onClick={() => setMoneyOpen(true)}>
            Račun / plačilo ({pickedOrders.length})
          </Button>
          <Button size="sm" disabled={pickedDrafts.length === 0} loading={busy} onClick={() => void confirmPicked()}>
            <Check className="size-3.5" /> Potrdi izbrane ({pickedDrafts.length})
          </Button>
        </div>
        <MoneyDialog orders={pickedOrders} open={moneyOpen} onOpenChange={setMoneyOpen} onDone={() => setPicked(new Set())} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[900px]">
            <thead>
              <tr className="bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-ink-subtle text-left">
                <th className="px-3 py-2.5 w-9">
                  <input
                    type="checkbox"
                    aria-label="Izberi vsa naročila"
                    checked={allPicked}
                    disabled={selectable.length === 0}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map((o) => o.id)))}
                  />
                </th>
                <th className="px-3 py-2.5 font-bold">#</th>
                <th className="px-3 py-2.5 font-bold">Kupec</th>
                <th className="px-3 py-2.5 font-bold">Dostava</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Voznik</th>
                <th className="px-3 py-2.5 font-bold">Vsebina</th>
                <th className="px-3 py-2.5 font-bold text-right">Vrednost</th>
                <th className="px-3 py-2.5 font-bold">Plačilo / račun</th>
                <th className="px-3 py-2.5 font-bold">Vir</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-line align-top hover:bg-surface-muted/60">
                  <td className="px-3 py-2.5">
                    <input type="checkbox" aria-label={`Izberi #${o.orderNumber}`} checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
                  </td>
                  <td className="px-3 py-2.5 tabular text-ink-subtle">{o.orderNumber}</td>
                  <td className="px-3 py-2.5 font-semibold">
                    {o.customerName}
                    {o.reviewNote && o.status === "draft" && <p className="text-[12px] font-normal text-warn">{o.reviewNote}</p>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{o.deliveryDate ? dateShort(new Date(`${o.deliveryDate}T12:00:00`)) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge>
                  </td>
                  <td className="px-3 py-2.5">{driverOf(o) || <span className="text-ink-subtle">—</span>}</td>
                  <td className="px-3 py-2.5 text-ink-muted max-w-[320px]">{o.lineSummary}</td>
                  <td className="px-3 py-2.5 text-right tabular font-semibold">
                    {eur(o.totalGross)}
                    {o.priceList === "fizicne" && <p className="text-[11px] font-normal text-ink-subtle">fiz. osebe</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      <OrderMoney order={o} compact />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-subtle">{SOURCE[o.source] ?? o.source}</td>
                  <td className="px-3 py-2.5 text-right">
                    {(o.status === "draft" || o.status === "confirmed") && (
                      <Button asChild variant="secondary" size="sm" className="h-7 px-2 text-[11.5px] gap-1">
                        <Link href={`/pisarna/${o.id}/uredi`}>
                          <Pencil className="size-3" /> Uredi
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-ink-muted">
                    Ni naročil za izbrane filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
