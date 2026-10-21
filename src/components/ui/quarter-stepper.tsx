"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { flasa } from "@/lib/format";

/**
 * Quantity in bottles that moves by a quarter: for samples poured at a customer, where a bottle is often not
 * emptied. "+1" adds a whole bottle. Large buttons: used one-handed.
 */
export function QuarterStepper({
  value,
  onChange,
  min = 0.25,
  max = 9999,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 4) / 4));
  const btn = "h-11 min-w-11 px-2 grid place-items-center text-ink hover:bg-surface-muted disabled:opacity-30 transition-colors";
  return (
    <div className="inline-flex items-center rounded-[var(--radius-control)] border border-line overflow-hidden bg-surface" role="group" aria-label={label}>
      <button type="button" aria-label={label ? `Zmanjšaj ${label}` : "Zmanjšaj"} className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - 0.25))}>
        <Minus className="size-4" />
      </button>
      <span className="w-12 text-center text-[15px] font-bold tabular">{flasa(value)}</span>
      <button type="button" aria-label={label ? `Povečaj ${label}` : "Povečaj"} className={btn} disabled={value >= max} onClick={() => onChange(clamp(value + 0.25))}>
        <Plus className="size-4" />
      </button>
      <button type="button" aria-label="Dodaj celo steklenico" className={`${btn} border-l border-line text-[12px] font-bold`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        +1
      </button>
    </div>
  );
}
