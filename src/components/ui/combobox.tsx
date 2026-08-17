"use client";

import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  /** Optional trailing element, e.g. an overdue badge on a customer. */
  meta?: React.ReactNode;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}

/**
 * Type-ahead picker.
 *
 * Used for the customer field, which is the first thing touched on every phone
 * order — so it opens on focus, filters on every keystroke, and never requires
 * a mouse.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Izberi\u2026",
  searchPlaceholder = "I\u0161\u010di\u2026",
  emptyText = "Ni zadetkov.",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full h-11 px-3 flex items-center justify-between gap-2",
            "rounded-[var(--radius-control)] bg-surface border border-line text-left",
            "hover:border-line-strong focus:border-wine focus:ring-4 focus:ring-wine-soft",
            "focus:outline-none transition-colors",
          )}
        >
          <span className={cn("truncate", !selected && "text-ink-subtle")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-[var(--radius-card)]
                     border border-line bg-surface shadow-pop overflow-hidden"
        >
          <Command className="w-full" loop>
            <div className="border-b border-line px-3">
              <CommandInput
                placeholder={searchPlaceholder}
                className="w-full h-11 bg-transparent text-[15px] outline-none placeholder:text-ink-subtle"
              />
            </div>
            <CommandList className="max-h-64 overflow-y-auto p-1">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-ink-subtle">
                {emptyText}
              </CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""}`}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] cursor-pointer
                               data-[selected=true]:bg-wine-soft"
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-wine",
                        value === o.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] truncate">{o.label}</span>
                      {o.hint && (
                        <span className="block text-xs text-ink-subtle truncate">{o.hint}</span>
                      )}
                    </span>
                    {o.meta}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
