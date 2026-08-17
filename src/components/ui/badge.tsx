import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.02em]",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-ink-muted",
        wine: "bg-wine-soft text-wine",
        good: "bg-good-soft text-good-ink",
        warn: "bg-warn-soft text-warn",
        danger: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Order status has one canonical colour across all three apps. */
export const statusTone = {
  draft: "warn",
  confirmed: "good",
  planned: "info",
  delivered: "info",
  invoiced: "neutral",
  cancelled: "danger",
} as const;

export const statusLabel = {
  draft: "Osnutek",
  confirmed: "Potrjeno",
  planned: "Na\u010drtovano",
  delivered: "Dostavljeno",
  invoiced: "Ra\u010dun izdan",
  cancelled: "Preklicano",
} as const;
