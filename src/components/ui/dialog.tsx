"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40 z-40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-surface border border-line shadow-xl",
          "inset-x-0 bottom-0 rounded-t-[20px] max-h-[85vh]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-full sm:max-w-md sm:rounded-[var(--radius-card)]",
          "flex flex-col overflow-hidden",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-line shrink-0">
          <DialogPrimitive.Title className="text-[15px] font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="text-ink-subtle hover:text-ink p-1 -m-1">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
