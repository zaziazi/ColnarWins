import * as React from "react";
import { cn } from "@/lib/utils";

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{children}</h2>;
}

/** A number with a label and a small hint underneath; ↑ ↓ shows the change against the previous period. */
export function Stat({ label, value, hint, delta, good, warn }: { label: string; value: string; hint?: string; delta?: number; good?: boolean; warn?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border bg-surface p-3.5", warn ? "border-warn" : "border-line")}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</p>
      <p className={cn("text-[22px] font-bold tabular mt-1", good && "text-good-ink")}>
        {value}
        {delta !== undefined && delta !== 0 && (
          <span className={cn("ml-1.5 text-[12px] font-semibold", delta > 0 ? "text-good-ink" : "text-ink-subtle")}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
          </span>
        )}
      </p>
      {hint && <p className="text-[11.5px] text-ink-subtle mt-0.5">{hint}</p>}
    </div>
  );
}
