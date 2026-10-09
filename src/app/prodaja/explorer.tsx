"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { List, Map as MapIcon, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SalesMapPoint, VenueKind } from "@/lib/types";
import { FILTER_KINDS, KIND_LABEL, fold } from "./constants";
import { AddVenueDialog, EMPTY_DRAFT, type VenueDraft } from "./add-venue";
import { PointSheet } from "./point-sheet";
import { VenueList } from "./venue-list";

// MapLibre needs a browser; load it client-side only.
const SalesMap = dynamic(() => import("./sales-map"), {
  ssr: false,
  loading: () => <div className="h-full grid place-items-center text-[13px] text-ink-subtle">Nalaganje zemljevida…</div>,
});

type StatusFilter = "all" | "client" | "nonclient" | "prospect" | "review";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 px-3 rounded-full text-[12px] font-semibold border whitespace-nowrap transition-colors",
        active ? "bg-wine text-white border-wine" : "bg-surface text-ink-muted border-line hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

/** Filters + map or list (one switch) + the detail sheet. Both views share the same filters. */
export function SalesExplorer({ points, initialView }: { points: SalesMapPoint[]; initialView: "map" | "list" }) {
  const [view, setView] = React.useState<"map" | "list">(initialView);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [kinds, setKinds] = React.useState<Set<VenueKind>>(new Set());
  const [query, setQuery] = React.useState("");
  const [others, setOthers] = React.useState(false);
  const [selected, setSelected] = React.useState<SalesMapPoint | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<VenueDraft>(EMPTY_DRAFT);
  const [picking, setPicking] = React.useState(false);

  const counts = React.useMemo(() => {
    const venues = points.filter((p) => p.source === "venue");
    return {
      venues: venues.length,
      client: venues.filter((p) => p.status === "client").length,
      nonclient: venues.filter((p) => p.status !== "client").length,
      prospect: venues.filter((p) => p.status === "prospect").length,
      review: venues.filter((p) => p.needsReview).length,
      others: points.length - venues.length,
    };
  }, [points]);

  const filtered = React.useMemo(() => {
    const q = fold(query.trim());
    return points.filter((p) => {
      if (p.source === "customer" && !others) return false;
      if (status === "client" && p.status !== "client") return false;
      if (status === "nonclient" && p.status === "client") return false;
      if (status === "prospect" && p.status !== "prospect") return false;
      if (status === "review" && !p.needsReview) return false;
      if (kinds.size > 0 && p.source === "venue" && !kinds.has(p.kind)) return false;
      if (kinds.size > 0 && p.source === "customer") return false;
      if (q && !fold(p.name).includes(q) && !fold(p.city ?? "").includes(q)) return false;
      return true;
    });
  }, [points, status, kinds, query, others]);

  // Keep the open sheet pointing at fresh data after a refresh.
  const selectedPoint = selected ? (points.find((p) => p.id === selected.id) ?? selected) : null;

  function toggleKind(k: VenueKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="size-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Išči po imenu ali kraju…"
            className="pl-9"
          />
        </div>
        <Button className="h-11 shrink-0" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Dodaj lokal
        </Button>
      </div>

      <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5 mb-3" role="group" aria-label="Pogled">
        {([
          ["map", "Zemljevid", MapIcon],
          ["list", "Seznam", List],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={cn(
              "h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors",
              view === key ? "bg-wine text-white" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
        <Chip active={status === "all"} onClick={() => setStatus("all")}>Vsi ({counts.venues})</Chip>
        <Chip active={status === "client"} onClick={() => setStatus("client")}>Stranke ({counts.client})</Chip>
        <Chip active={status === "nonclient"} onClick={() => setStatus("nonclient")}>Ni stranke ({counts.nonclient})</Chip>
        <Chip active={status === "prospect"} onClick={() => setStatus("prospect")}>Potencialne ({counts.prospect})</Chip>
        <Chip active={status === "review"} onClick={() => setStatus("review")}>Za pregled ({counts.review})</Chip>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
        {FILTER_KINDS.map((k) => (
          <Chip key={k} active={kinds.has(k)} onClick={() => toggleKind(k)}>
            {KIND_LABEL[k]}
          </Chip>
        ))}
        <Chip active={others} onClick={() => setOthers((v) => !v)}>
          Ostale stranke ({counts.others})
        </Chip>
      </div>

      <p className="text-[12px] text-ink-subtle mb-2.5">
        {filtered.length} {filtered.length === 1 ? "zadetek" : "zadetkov"}
      </p>

      {view === "map" ? (
        <div className="relative h-[58vh] min-h-[360px] rounded-[var(--radius-card)] overflow-hidden border border-line bg-surface-muted">
          <SalesMap
            points={filtered}
            onSelect={setSelected}
            pickMode={picking}
            onPick={(lat, lng) => {
              setDraft((d) => ({ ...d, lat, lng }));
              setPicking(false);
              setAdding(true);
            }}
          />
          {picking && (
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-ink text-white px-3 py-2 text-[12.5px]">
              <span>Tapni na zemljevid, kjer je lokal.</span>
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  setPicking(false);
                  setAdding(true);
                }}
              >
                Prekliči
              </button>
            </div>
          )}
        </div>
      ) : (
        <VenueList points={filtered} onSelect={setSelected} />
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-subtle">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-good" /> naša stranka</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-wine" /> potencialna</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-ink-muted" /> ni stranka</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border-2 border-warn" /> za pregled</span>
      </div>

      <PointSheet point={selectedPoint} onClose={() => setSelected(null)} />

      <AddVenueDialog
        open={adding}
        onOpenChange={setAdding}
        draft={draft}
        setDraft={setDraft}
        canPickOnMap={view === "map"}
        onPickOnMap={() => {
          setAdding(false);
          setPicking(true);
        }}
        onCreated={(r) => {
          // Open the new venue straight away; the refreshed data catches up behind it.
          setSelected({
            source: "venue",
            id: r.id,
            name: r.name,
            kind: draft.kind,
            lat: r.lat,
            lng: r.lng,
            city: draft.city || null,
            phone: draft.phone || null,
            email: draft.email || null,
            status: "open",
            needsReview: false,
          });
        }}
      />
    </div>
  );
}
