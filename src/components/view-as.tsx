"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { setViewAs } from "@/app/view-as/actions";
import type { ViewAsState } from "@/lib/data";

const ROLE_LABEL: Record<string, string> = {
  manager: "vodja",
  office: "pisarna",
  driver: "voznik",
  sales: "prodaja",
  events: "degustacije",
};

const Ctx = React.createContext<ViewAsState | null>(null);

export function ViewAsProvider({ state, children }: { state: ViewAsState; children: React.ReactNode }) {
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

function useSwitch() {
  const [pending, start] = React.useTransition();
  function go(id: string | null) {
    start(async () => {
      const r = await setViewAs(id);
      if (!r.ok) {
        toast.error("Preklop ni uspel.");
        return;
      }
      // full load so every page re-reads the profile it is shown as
      window.location.href = "/";
    });
  }
  return { pending, go };
}

/** "Poglej kot …" picker for the admin; renders nothing for everyone else. */
export function ViewAsPicker({ className }: { className?: string }) {
  const state = React.useContext(Ctx);
  const { pending, go } = useSwitch();
  if (!state?.enabled) return null;
  return (
    <label className={className}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-subtle mb-1">
        <Eye className="size-3.5" strokeWidth={1.8} /> Poglej kot
      </span>
      <select
        disabled={pending}
        value={state.viewingId ?? ""}
        onChange={(e) => go(e.target.value || null)}
        className="w-full h-9 rounded-[8px] border border-line bg-surface px-2 text-[13px] font-medium text-ink"
      >
        <option value="">Jaz (admin)</option>
        {state.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {ROLE_LABEL[p.role] ?? p.role}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shown on every page while the admin looks at the app as someone else. */
export function ViewAsBanner() {
  const state = React.useContext(Ctx);
  const { pending, go } = useSwitch();
  if (!state?.enabled || !state.viewingId) return null;
  return (
    <div className="bg-ink text-white px-4 py-2 flex items-center justify-between gap-3 text-[13px]">
      <span className="min-w-0">
        <Eye className="inline size-4 -mt-0.5 mr-1.5" strokeWidth={1.8} />
        Pogled: <strong>{state.viewingName}</strong>
        <span className="hidden sm:inline opacity-70"> · spremembe se zapišejo pod tvojim imenom</span>
      </span>
      <button type="button" disabled={pending} onClick={() => go(null)} className="shrink-0 rounded-[8px] bg-white/15 hover:bg-white/25 px-3 py-1 font-semibold">
        Nazaj na svoj pogled
      </button>
    </div>
  );
}
