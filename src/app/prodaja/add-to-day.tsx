"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dayMonth, weekdayName } from "@/lib/sales/dates";
import { suggest, towns } from "@/lib/sales/suggest";
import type { SalesMapPoint } from "@/lib/types";
import { fold, KIND_LABEL } from "./constants";
import { planVisits } from "./teren-actions";

type Filter = "nonclient" | "all" | "client" | "prospect";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "nonclient", label: "Ni stranke" },
  { key: "prospect", label: "Potencialne" },
  { key: "client", label: "Stranke" },
  { key: "all", label: "Vsi" },
];

/**
 * The funnel for filling a day: pick a town, then tick venues. Venues are
 * sorted by a simple "worth a visit" score and each says why.
 */
export function AddToDayDialog({
  open,
  onOpenChange,
  date,
  points,
  plannedKeys,
  suggestedTown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  points: SalesMapPoint[];
  /** Keys (`source:id`) already planned that day. */
  plannedKeys: Set<string>;
  suggestedTown?: string | null;
}) {
  const router = useRouter();
  const [town, setTown] = React.useState<string | null>(null);
  const [townQuery, setTownQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("nonclient");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const scores = React.useMemo(() => suggest(points), [points]);
  const townList = React.useMemo(() => towns(points), [points]);

  React.useEffect(() => {
    if (open) {
      setPicked(new Set());
      setTown(suggestedTown ? fold(suggestedTown) : null);
      setTownQuery("");
    }
  }, [open, date, suggestedTown]);

  const townName = townList.find((t) => t.key === town)?.name ?? "";
  const shownTowns = townList.filter((t) => !townQuery || fold(t.name).includes(fold(townQuery)));

  const venues = React.useMemo(() => {
    if (!town) return [];
    return points
      .filter((p) => p.city && fold(p.city.trim()) === town)
      .filter((p) => {
        if (filter === "all") return true;
        if (filter === "client") return p.status === "client";
        if (filter === "prospect") return p.status === "prospect";
        return p.status !== "client";
      })
      .sort((a, b) => (scores.get(`${b.source}:${b.id}`)?.score ?? 0) - (scores.get(`${a.source}:${a.id}`)?.score ?? 0));
  }, [points, town, filter, scores]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    const targets = points
      .filter((p) => picked.has(`${p.source}:${p.id}`))
      .map((p) => (p.source === "venue" ? { venueId: p.id } : { customerId: p.id }));
    if (targets.length === 0) return;
    setBusy(true);
    const r = await planVisits({ date, targets });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.added ? `Dodano: ${r.added}` : "Vsi izbrani so že na seznamu.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`${weekdayName(date)}, ${dayMonth(date)}`}>
        {town === null ? (
          <div>
            <p className="text-[12.5px] text-ink-muted mb-2.5">Kam greš? Izberi kraj, nato lokale.</p>
            <div className="relative mb-2.5">
              <Search className="size-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={townQuery} onChange={(e) => setTownQuery(e.target.value)} placeholder="Išči kraj…" className="pl-9" />
            </div>
            <div className="max-h-[52vh] overflow-y-auto -mx-1">
              {shownTowns.slice(0, 80).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTown(t.key)}
                  className="w-full flex items-center justify-between gap-3 px-2 py-2.5 rounded-[10px] text-left hover:bg-surface-muted"
                >
                  <span className="font-semibold text-[14px]">{t.name}</span>
                  <span className="text-[11.5px] text-ink-subtle shrink-0">
                    {t.open} novih · {t.clients} strank
                  </span>
                </button>
              ))}
              {shownTowns.length === 0 && <p className="text-[13px] text-ink-subtle p-2">Ni krajev.</p>}
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setTown(null)}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-wine mb-2"
            >
              <ChevronLeft className="size-4" /> {townName}
            </button>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold border ${
                    filter === f.key ? "bg-wine text-white border-wine" : "bg-surface text-ink-muted border-line"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="max-h-[46vh] overflow-y-auto -mx-1">
              {venues.length === 0 && <p className="text-[13px] text-ink-subtle p-2">Ni lokalov s tem filtrom.</p>}
              {venues.map((p) => {
                const key = `${p.source}:${p.id}`;
                const already = plannedKeys.has(key);
                const s = scores.get(key);
                return (
                  <label
                    key={key}
                    className={`flex items-start gap-3 px-2 py-2.5 rounded-[10px] ${already ? "opacity-50" : "hover:bg-surface-muted cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-wine)]"
                      checked={picked.has(key) || already}
                      disabled={already}
                      onChange={() => toggle(key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-[14px] truncate">{p.name}</span>
                        {p.status === "client" && <Badge tone="good">stranka</Badge>}
                        {p.status === "prospect" && <Badge tone="wine">potencialna</Badge>}
                      </span>
                      <span className="block text-[11.5px] text-ink-subtle">
                        {KIND_LABEL[p.kind]}
                        {s && s.reasons.length > 0 && ` · ${s.reasons.join(" · ")}`}
                        {already && " · že na seznamu"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <Button className="w-full mt-3" disabled={picked.size === 0} loading={busy} onClick={() => void submit()}>
              Dodaj v dan ({picked.size})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
