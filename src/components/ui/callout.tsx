import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info, CheckCircle2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

const calloutVariants = cva("rounded-[12px] border p-3 flex gap-2.5 items-start text-[13px]", {
  variants: {
    tone: {
      wine: "bg-wine-soft border-wine-border text-ink",
      good: "bg-good-soft border-good/20 text-good-ink",
      warn: "bg-warn-soft border-warn/20 text-warn",
      danger: "bg-danger-soft border-danger/20 text-danger",
      info: "bg-info-soft border-info/20 text-info",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons = {
  wine: RotateCw,
  good: CheckCircle2,
  warn: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
} as const;

export interface CalloutProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof calloutVariants> {
  icon?: boolean;
}

/**
 * Inline message attached to the thing it is about.
 *
 * Status colour never travels alone here — every callout ships with an icon,
 * so meaning survives for colour-blind users and in print.
 */
export function Callout({ className, tone = "info", icon = true, children, ...props }: CalloutProps) {
  const Icon = icons[tone ?? "info"];
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {icon && <Icon className="size-4 shrink-0 mt-0.5" />}
      <div className="flex-1 leading-relaxed">{children}</div>
    </div>
  );
}
