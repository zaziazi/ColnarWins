"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addStopToRoute } from "./actions";
import type { RouteWithStops } from "@/lib/types";

interface Props {
  orderId: string;
  routes: RouteWithStops[];
}

/** Assigns an unrouted order to one of today's routes as its next stop. */
export function AddToRoute({ orderId, routes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onChange(routeId: string) {
    if (!routeId) return;
    startTransition(async () => {
      const result = await addStopToRoute({ routeId, orderId });
      if (!result.ok) {
        toast.error(result.error ?? "Naročila ni bilo mogoče dodati na pot");
        return;
      }
      router.refresh();
    });
  }

  if (routes.length === 0) {
    return <p className="text-[11.5px] text-ink-subtle">Najprej ustvari pot zgoraj.</p>;
  }

  return (
    <select
      defaultValue=""
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 text-[12.5px] font-medium rounded-[var(--radius-control)] border border-line
                 bg-surface text-ink pl-2 pr-1 disabled:opacity-50"
    >
      <option value="" disabled>
        — dodaj na pot —
      </option>
      {routes.map((r) => (
        <option key={r.id} value={r.id}>
          {r.vehicle}
          {r.driverName ? ` · ${r.driverName}` : ""}
        </option>
      ))}
    </select>
  );
}
