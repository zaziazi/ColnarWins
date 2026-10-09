"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Phone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dayMonth, weekdayName } from "@/lib/sales/dates";
import { suggest, towns, WINE_KINDS } from "@/lib/sales/suggest";
import type { SalesMapPoint, VenueKind } from "@/lib/types";
import { FILTER_KINDS, fold, KIND_LABEL } from "./constants";
import { planVisits } from "./teren-actions";

type Status = "nonclient" | "all" | "client" | "prospect";

const STATUSES: { key: Status; label: string }[] = [
  { key: "nonclient", label: "Ni stranke" },
  { key: "prospect", label: "Potencialne" },
  { key: "client", label: "Stranke" },
  { key: "all", label: "Vsi" },
];

interface Prefs {
  status: Status;
  kinds: VenueKind[];
  phoneOnly: boolean;
}

const DEFAULT_PREFS: Prefs = { status: "nonclient", kinds: WINE_KINDS, phoneOnly: false };
const STORAGE_KEY = "colnix-add-to-day-filters";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return {
        status: p.status ?? DEFAULT_PREFS.status,
        kinds: Array.isArray(p.kinds) ? p.kinds : DEFAULT_PREFS.kinds,
        phoneOnly: Boolean(p.phoneOnly),
      };
    }
  } catch {
    // storage unavailable — defaults are fine
  }
  return DEFAULT_PREFS;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
        active ? "bg-wine text-white border-wine" : "bg-surface text-ink-muted border-line"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The funnel for filling a day: pick a town, then tick venues. The venue step
 * opens with a sensible filter already applied (not yet customers, types that
 * sell wine) which can be narrowed or widened; the choice is remembered.
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
  const [venueQuery, setVenueQuery] = React.useState("");
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const scores = React.useMemo(() => suggest(points), [points]);
  const townList = React.useMemo(() => towns(points), [points]);

  React.useEffect(() => {
    if (open) {
      setPrefs(loadPrefs());
      setPicked(new Set());
      setTown(suggestedTown ? fold(suggestedTown.trim()) : null);
      setTownQuery("");
      setVenueQuery("");
    }
  }, [open, date, suggestedTown]);

  function updatePrefs(next: Prefs) {
    setPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const townName = townList.find((t) => t.key === town)?.name ?? "";
  const shownTowns = townList.filter((t) => !townQuery || fold(t.name).includes(fold(townQuery)));

  const inTown = React.useMemo(
    () => (town ? points.filter((p) => p.city && fold(p.city.trim()) === town) : []),
    [points, town],
  );

  const venues = React.useMemo(() => {
    const q = fold(venueQuery.trim());
    const kinds = new Set(prefs.kinds);
    return inTown
      .filter((p) => {
        if (prefs.status === "client" && p.status !== "client") return false;
        if (prefs.status === "prospect" && p.status !== "prospect") return false;
        if (prefs.status === "nonclient" && p.status === "client") return false;
        // type filter only narrows venues; customers shown under "Stranke"/"Vsi" always pass
        if (kinds.size > 0 && p.source === "venue" && p.status !== "client" && !kinds.has(p.kind)) return false;
        if (prefs.phoneOnly && !p.phone) return false;
        if (q && !fold(p.name).includes(q)) return false;
        return true;
      })
      .sort((a, b) => (scores.get(`${b.source}:${b.id}`)?.score ?? 0) - (scores.get(`${a.source}:${a.id}`)?.score ?? 0));
  }, [inTown, prefs, venueQuery, scores]);

  const selectable = venues.filter((p) => !plannedKeys.has(`${p.source}:${p.id}`));
  const hiddenByFilter = inTown.length - venues.length;

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleKind(k: VenueKind) {
    const has = prefs.kinds.includes(k);
    updatePrefs({ ...prefs, kinds: has ? prefs.kinds.filter((x) => x !== k) : [...prefs.kinds, k] });
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

  const allKinds = prefs.kinds.length === 0;

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
                    {t.suitable} primernih · {t.clients} strank
                  </span>
                </button>
              ))}
              {shownTowns.length === 0 && <p className="text-[13px] text-ink-subtle p-2">Ni krajev.</p>}
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setTown(null)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-wine mb-2">
              <ChevronLeft className="size-4" /> {townName}
            </button>

            <div className="relative mb-2">
              <Search className="size-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={venueQuery} onChange={(e) => setVenueQuery(e.target.value)} placeholder={`Išči v kraju ${townName}…`} className="pl-9 h-10" />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              {STATUSES.map((s) => (
                <Chip key={s.key} active={prefs.status === s.key} onClick={() => updatePrefs({ ...prefs, status: s.key })}>
                  {s.label}
                </Chip>
              ))}
              <Chip active={prefs.phoneOnly} onClick={() => updatePrefs({ ...prefs, phoneOnly: !prefs.phoneOnly })}>
                <Phone className="size-3 inline -mt-0.5 mr-1" />
                Samo s telefonom
              </Chip>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              <Chip active={allKinds} onClick={() => updatePrefs({ ...prefs, kinds: [] })}>
                Vse vrste
              </Chip>
              {FILTER_KINDS.map((k) => (
                <Chip key={k} active={prefs.kinds.includes(k)} onClick={() => toggleKind(k)}>
                  {KIND_LABEL[k]}
                </Chip>
              ))}
            </div>

            <div className="flex items-center justify-between text-[12px] text-ink-subtle mb-1">
              <span>
                {venues.length} lokalov
                {hiddenByFilter > 0 && ` · ${hiddenByFilter} skritih s filtrom`}
              </span>
              {selectable.length > 0 && (
                <button
                  type="button"
                  className="font-semibold text-wine"
                  onClick={() =>
                    setPicked((prev) => {
                      const keys = selectable.slice(0, 15).map((p) => `${p.source}:${p.id}`);
                      return keys.every((k) => prev.has(k)) ? new Set() : new Set([...prev, ...keys]);
                    })
                  }
                >
                  Izberi prvih {Math.min(15, selectable.length)}
                </button>
              )}
            </div>

            <div className="max-h-[36vh] overflow-y-auto -mx-1">
              {venues.length === 0 && <p className="text-[13px] text-ink-subtle p-2">Ni lokalov s tem filtrom.</p>}
              {venues.map((p) => {
                const key = `${p.source}:${p.id}`;
                const already = plannedKeys.has(key);
                const s = scores.get(key);
                return (
                  <label key={key} className={`flex items-start gap-3 px-2 py-2.5 rounded-[10px] ${already ? "opacity-50" : "hover:bg-surface-muted cursor-pointer"}`}>
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
