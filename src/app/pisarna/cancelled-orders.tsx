"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { dateShort, eur } from "@/lib/format";
import type { OrderListItem } from "@/lib/types";
import { deleteOrder, restoreOrder } from "./actions";

/** Recently cancelled orders: bring one back (a mistaken cancel) or remove it for good. */
export function CancelledOrders({ orders }: { orders: OrderListItem[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (orders.length === 0) return null;

  function restore(id: string) {
    startTransition(async () => {
      const r = await restoreOrder(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Naročilo je spet aktivno.");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteOrder(id);
      setDeleting(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Naročilo je izbrisano.");
      router.refresh();
    });
  }

  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Preklicana ({orders.length})</summary>
      <div className="space-y-2.5 mt-2.5">
        {orders.map((o) => (
          <Card key={o.id} className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[15px] truncate line-through decoration-ink-subtle">{o.customerName}</p>
                <p className="text-[11.5px] text-ink-subtle mt-0.5">
                  #{o.orderNumber}
                  {o.deliveryDate && ` · dostava ${dateShort(new Date(`${o.deliveryDate}T12:00:00`))}`}
                  {o.cancelledAt && ` · preklicano ${dateShort(new Date(o.cancelledAt))}`}
                </p>
                {o.cancelReason && <p className="text-[12px] text-ink-muted mt-1">Razlog: {o.cancelReason}</p>}
                <p className="text-[12.5px] text-ink-muted mt-1.5">{o.lineSummary}</p>
              </div>
              <span className="text-[13px] font-semibold tabular shrink-0">{eur(o.totalGross)}</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" className="h-8 gap-1" onClick={() => restore(o.id)} disabled={pending}>
                <RotateCcw className="size-3.5" /> Obnovi
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-ink-subtle hover:text-danger hover:bg-danger-soft" onClick={() => setDeleting(o.id)} disabled={pending}>
                <Trash2 className="size-3.5" /> Izbriši
              </Button>
            </div>
            {deleting === o.id && (
              <Callout tone="danger" className="mt-2.5">
                <p>Trajno izbrišem to naročilo? Tega ni mogoče razveljaviti.</p>
                <div className="flex gap-2 mt-2.5">
                  <Button size="sm" variant="danger" onClick={() => remove(o.id)} loading={pending}>
                    Izbriši naročilo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(null)} disabled={pending}>
                    Nazaj
                  </Button>
                </div>
              </Callout>
            )}
          </Card>
        ))}
      </div>
    </details>
  );
}
