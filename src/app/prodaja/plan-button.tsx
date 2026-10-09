"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { addDays, dayMonth, todayIso, weekdayName } from "@/lib/sales/dates";
import { planVisits } from "./teren-actions";

/** "Add to a day" shortcut at the top of the map/list venue sheet. */
export function PlanButton({ target }: { target: { venueId: string } | { customerId: string } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const today = todayIso();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  async function add(date: string) {
    setBusy(true);
    const r = await planVisits({ date, targets: [target] });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.added ? `Dodano na ${weekdayName(date).toLowerCase()}, ${dayMonth(date)}` : "Že na seznamu tega dne.");
    router.refresh();
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <CalendarPlus className="size-4 text-wine shrink-0" />
      <select
        disabled={busy}
        value=""
        onChange={(e) => e.target.value && void add(e.target.value)}
        className="h-10 flex-1 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13.5px] font-semibold text-wine"
        aria-label="Dodaj v dan"
      >
        <option value="">Dodaj v načrt obiskov…</option>
        {days.map((d, i) => (
          <option key={d} value={d}>
            {i === 0 ? "Danes" : i === 1 ? "Jutri" : weekdayName(d)} · {dayMonth(d)}
          </option>
        ))}
      </select>
    </div>
  );
}
