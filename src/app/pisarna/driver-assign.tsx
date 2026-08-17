"use client";

import * as React from "react";
import { toast } from "sonner";
import { assignDriver } from "./actions";
import type { Driver } from "@/lib/types";

interface Props {
  orderId: string;
  drivers: Driver[];
  assignedDriverId: string | null;
}

/** Interim driver picker on the order card — see sales_order.assigned_driver_id. */
export function DriverAssign({ orderId, drivers, assignedDriverId }: Props) {
  const [pending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState(assignedDriverId ?? "");

  function onChange(next: string) {
    setValue(next);
    startTransition(async () => {
      const result = await assignDriver(orderId, next || null);
      if (!result.ok) {
        setValue(assignedDriverId ?? "");
        toast.error(result.error ?? "Voznika ni bilo mogoče nastaviti");
      }
    });
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="h-7 text-[11.5px] font-medium rounded-[var(--radius-control)] border border-line
                 bg-surface text-ink-muted pl-2 pr-1 disabled:opacity-50"
    >
      <option value="">— voznik —</option>
      {drivers.map((d) => (
        <option key={d.id} value={d.id}>
          {d.fullName}
        </option>
      ))}
    </select>
  );
}
