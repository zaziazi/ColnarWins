"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { dateShort, eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCustomerOrderHistory, type CustomerOrderHistory } from "./actions";

/** "Kaj je stranka do sedaj naročila": totals and the last orders with their contents. Loads when opened. */
export function CustomerOrders({ customerId, defaultOpen = false }: { customerId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [d, setD] = React.useState<CustomerOrderHistory | null | undefined>(undefined);

  React.useEffect(() => {
    setD(undefined);
    if (open) void getCustomerOrderHistory(customerId).then(setD);
  }, [customerId, open]);

  return (
    <div className="rounded-[var(--radius-control)] border border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="text-[13.5px] font-semibold">Kaj je do sedaj naročila</span>
        <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2.5">
          {d === undefined ? (
            <p className="text-[12.5px] text-ink-subtle">Nalaganje…</p>
          ) : d === null || d.orders.length === 0 ? (
            <p className="text-[12.5px] text-ink-subtle">Naročil še ni.</p>
          ) : (
            <>
              <p className="text-[12.5px] text-ink-muted mb-2">
                {d.orderCount} naročil
                {d.lastOrderOn ? ` · zadnje ${dateShort(new Date(`${d.lastOrderOn}T12:00:00`))}` : ""}
                {" · "}
                <span className="font-semibold text-ink">{eur(d.last12MonthsGross)}</span> v zadnjih 12 mesecih
              </p>
              <ul className="divide-y divide-line">
                {d.orders.map((o) => (
                  <li key={o.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold">
                        {o.date ? dateShort(new Date(`${o.date}T12:00:00`)) : "—"} · #{o.number}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge>
                        <span className="text-[12.5px] font-semibold tabular">{eur(o.gross)}</span>
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-0.5 leading-snug">{o.summary}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
