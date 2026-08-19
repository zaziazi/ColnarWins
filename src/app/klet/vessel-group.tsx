"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { VesselSummaryCard } from "./vessel-summary-card";
import { cn } from "@/lib/utils";
import type { Vessel } from "@/lib/types";

export function VesselGroup({ label, vessels }: { label: string; vessels: Vessel[] }) {
  const [open, setOpen] = React.useState(true);
  if (vessels.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 mb-2.5 px-0.5"
      >
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">
          {label} <span className="text-ink-subtle/70">· {vessels.length}</span>
        </h2>
        <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", !open && "-rotate-90")} />
      </button>

      {open && (
        <div className="space-y-2.5">
          {vessels.map((vessel) => (
            <VesselSummaryCard key={vessel.id} vessel={vessel} />
          ))}
        </div>
      )}
    </div>
  );
}
