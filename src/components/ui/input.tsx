import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-11 px-3 rounded-[var(--radius-control)] bg-surface text-ink",
        "border border-line placeholder:text-ink-subtle",
        "hover:border-line-strong focus:border-wine focus:outline-none",
        "focus:ring-4 focus:ring-wine-soft transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full min-h-[72px] p-3 rounded-[var(--radius-control)] bg-surface text-ink resize-none",
        "border border-line placeholder:text-ink-subtle",
        "hover:border-line-strong focus:border-wine focus:outline-none",
        "focus:ring-4 focus:ring-wine-soft transition-colors",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
