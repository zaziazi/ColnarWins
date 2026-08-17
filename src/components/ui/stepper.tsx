"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Wine moves in cases. The buttons step by this; typing allows any number. */
  step?: number;
  min?: number;
  max?: number;
  label?: string;
}

/**
 * Quantity stepper.
 *
 * Deliberately large hit targets: this is used one-handed, on a phone, while
 * the operator is on a call. Stepping by case size is what makes a repeat
 * order two taps instead of a keyboard.
 */
export function Stepper({
  value,
  onChange,
  step = 6,
  min = 0,
  max = 9999,
  label,
}: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="inline-flex items-center rounded-[var(--radius-control)] border border-line overflow-hidden bg-surface">
      <button
        type="button"
        aria-label={label ? `Zmanj\u0161aj ${label}` : "Zmanj\u0161aj"}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="h-11 w-11 grid place-items-center text-ink hover:bg-surface-muted
                   disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Minus className="size-4" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
          onChange(Number.isNaN(n) ? 0 : clamp(n));
        }}
        className={cn(
          "w-11 h-11 text-center text-[15px] font-bold tabular bg-transparent",
          "focus:outline-none focus:bg-wine-soft",
          value === 0 && "text-ink-subtle",
        )}
      />

      <button
        type="button"
        aria-label={label ? `Pove\u010daj ${label}` : "Pove\u010daj"}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="h-11 w-11 grid place-items-center text-ink hover:bg-surface-muted
                   disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
