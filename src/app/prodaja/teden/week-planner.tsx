"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Phone, Plus, Route, X } from "lucide-react";
import { PushToggle } from "@/app/dostava/push-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, dayMonth, weekdayName, weekStart } from "@/lib/sales/dates";
import { routeOrder } from "@/lib/sales/suggest";
import type { FollowUp, PlannedVisit, SalesMapPoint } from "@/lib/types";
import { AddToDayDialog } from "../add-to-day";
import { KIND_LABEL } from "../constants";
import { RouteButton } from "../route-button";
import { OUTCOME_LABEL, OUTCOME_TONE } from "../outcome";
import { planVisits, removeVisit, reorderVisits, setDayLabel, setVisitTime } from "../teren-actions";

/** Half-hour steps through the working day — a dropdown avoids half-typed times. */
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

interface DayData {
  date: string;
  label: string;
  visits: PlannedVisit[];
}

export function WeekPlanner({
  today,
  start,
  days,
  followUps,
  points,
  calendarUrl,
}: {
  today: string;
  start: string;
  days: DayData[];
  followUps: FollowUp[];
  points: SalesMapPoint[];
  calendarUrl: string | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState<string | null>(null);

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    const r = await p;
    if (!r.ok) toast.error(r.error ?? "Ni uspelo.");
    router.refresh();
  }

  const addingDay = days.find((d) => d.date === adding);
  const plannedKeys = new Set(
    (addingDay?.visits ?? []).map((v) => (v.venueId ? `venue:${v.venueId}` : `customer:${v.customerId}`)),
  );
  const weekLabel = `${dayMonth(start)} – ${dayMonth(addDays(start, 6))}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => router.push(`/prodaja/teden?t=${addDays(start, -7)}`)} aria-label="Prejšnji teden">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <div className="text-[14px] font-bold">{weekLabel}</div>
          {start !== weekStart(today) && (
            <Link href="/prodaja/teden" className="text-[11.5px] font-semibold text-wine">
              Ta teden
            </Link>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/prodaja/teden?t=${addDays(start, 7)}`)} aria-label="Naslednji teden">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <PushToggle
        swPath="/prodaja-sw.js"
        scope="/prodaja/"
        onText="Zjutraj ob 7:00 dobiš seznam obiskov za danes"
        offText="Obvestilo ob 7:00 z obiski za danes"
      />

      {followUps.length > 0 && (
        <Card className="p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-2">
            Za nadaljnji obisk ({followUps.length})
          </div>
          <div className="space-y-2.5">
            {followUps.map((f) => (
              <FollowUpRow
                key={f.visitId}
                f={f}
                today={today}
                days={days.map((d) => d.date).filter((d) => d >= today)}
                onPlan={(date) =>
                  void run(planVisits({ date, targets: [f.venueId ? { venueId: f.venueId } : { customerId: f.customerId! }] }))
                }
              />
            ))}
          </div>
        </Card>
      )}

      {days.map((d) => (
        <DayCard
          key={d.date}
          day={d}
          today={today}
          onAdd={() => setAdding(d.date)}
          onRemove={(id) => void run(removeVisit(id))}
          onMove={(open, i, dir) => {
            const ids = open.map((v) => v.id);
            const j = i + dir;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            void run(reorderVisits(ids));
          }}
          onOptimize={(open) => void run(reorderVisits(routeOrder(open).map((v) => v.id)))}
          onTime={(id, time) => void run(setVisitTime(id, time))}
          onLabel={(label) => void run(setDayLabel(d.date, label))}
        />
      ))}

      {calendarUrl && <CalendarCard url={calendarUrl} />}

      <AddToDayDialog
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        date={adding ?? today}
        points={points}
        plannedKeys={plannedKeys}
        suggestedTown={addingDay?.label || null}
      />
    </div>
  );
}

function FollowUpRow({
  f,
  today,
  days,
  onPlan,
}: {
  f: FollowUp;
  today: string;
  days: string[];
  onPlan: (date: string) => void;
}) {
  const overdue = f.followUpOn < today;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-[13.5px] truncate">{f.name}</div>
        <div className="text-[11.5px] text-ink-subtle">
          {f.city && `${f.city} · `}do {dayMonth(f.followUpOn)}
          {f.note && ` · ${f.note}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {overdue && <Badge tone="warn">zamuja</Badge>}
        <select
          className="h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[12.5px]"
          value=""
          onChange={(e) => e.target.value && onPlan(e.target.value)}
          aria-label="Dodaj v dan"
        >
          <option value="">Dodaj v…</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {weekdayName(d).slice(0, 3)} {dayMonth(d)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DayCard({
  day,
  today,
  onAdd,
  onRemove,
  onMove,
  onOptimize,
  onTime,
  onLabel,
}: {
  day: DayData;
  today: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (untimed: PlannedVisit[], i: number, dir: -1 | 1) => void;
  onOptimize: (open: PlannedVisit[]) => void;
  onTime: (id: string, time: string | null) => void;
  onLabel: (label: string) => void;
}) {
  const open = day.visits.filter((v) => !v.visitedAt); // already in visit-time order
  const untimed = open.filter((v) => !v.plannedTime);
  const done = day.visits.filter((v) => v.visitedAt);
  const isToday = day.date === today;
  const past = day.date < today;
  const [label, setLabel] = React.useState(day.label);
  React.useEffect(() => setLabel(day.label), [day.label]);

  return (
    <Card className={`p-3.5 ${isToday ? "border-wine" : ""} ${past && day.visits.length === 0 ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] font-bold">
          {weekdayName(day.date)} <span className="font-medium text-ink-muted">{dayMonth(day.date)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isToday && (
            <Button asChild size="sm" variant="secondary">
              <Link href="/prodaja/danes">Na terenu</Link>
            </Button>
          )}
          {!past && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="size-4" /> Lokali
            </Button>
          )}
        </div>
      </div>

      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() !== day.label && onLabel(label)}
        placeholder="Kam greš? (npr. Novo mesto)"
        className="mt-2 h-9 text-[13px]"
        disabled={past}
      />

      {day.visits.length === 0 && <p className="text-[12.5px] text-ink-subtle mt-2.5">Ni načrtovanih obiskov.</p>}

      <div className="mt-2 divide-y divide-line">
        {open.map((v) => {
          const ui = untimed.findIndex((u) => u.id === v.id); // position among stops without a time
          return (
          <div key={v.id} className="py-2.5 flex items-start gap-2">
            <div className="flex flex-col gap-0.5 pt-0.5 w-3.5">
              {ui >= 0 && untimed.length > 1 && (
                <>
                  <button type="button" aria-label="Više" disabled={ui === 0} onClick={() => onMove(untimed, ui, -1)} className="text-ink-subtle disabled:opacity-25 hover:text-ink">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Niže" disabled={ui === untimed.length - 1} onClick={() => onMove(untimed, ui, 1)} className="text-ink-subtle disabled:opacity-25 hover:text-ink">
                    <ArrowDown className="size-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13.5px] truncate">{v.name}</span>
                {v.isCustomer && <Badge tone="good">stranka</Badge>}
              </div>
              <div className="text-[11.5px] text-ink-subtle truncate">
                {[v.kind ? KIND_LABEL[v.kind] : null, v.city, v.address].filter(Boolean).join(" · ")}
              </div>
              {v.phone && (
                <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 text-[11.5px] text-wine mt-0.5">
                  <Phone className="size-3" /> {v.phone}
                </a>
              )}
            </div>
            <select
              value={v.plannedTime ?? ""}
              onChange={(e) => onTime(v.id, e.target.value || null)}
              className={`h-8 w-[84px] rounded-[8px] border border-line bg-surface px-1.5 text-[12.5px] shrink-0 ${
                v.plannedTime ? "font-bold text-ink" : "text-ink-subtle"
              }`}
              aria-label="Ura obiska"
            >
              <option value="">ura</option>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Odstrani" onClick={() => onRemove(v.id)} className="text-ink-subtle hover:text-danger pt-1.5">
              <X className="size-4" />
            </button>
          </div>
          );
        })}
        {done.map((v) => (
          <div key={v.id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <Check className="size-4 text-good shrink-0" />
              <span className="text-[13.5px] truncate">{v.name}</span>
            </div>
            {v.outcome && <Badge tone={OUTCOME_TONE[v.outcome]}>{OUTCOME_LABEL[v.outcome]}</Badge>}
          </div>
        ))}
      </div>

      {untimed.length >= 3 && (
        <button type="button" onClick={() => onOptimize(untimed)} className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-wine">
          <Route className="size-3.5" /> Razporedi stopnje brez ure po poti
        </button>
      )}
      {open.length > 0 && open.some((v) => v.plannedTime) && untimed.length > 0 && (
        <p className="text-[11.5px] text-ink-subtle mt-1.5">Najprej lokali z uro, nato ostali.</p>
      )}
      {open.length > 0 && <RouteButton stops={open} className="mt-3" />}
    </Card>
  );
}

function CalendarCard({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Povezava kopirana");
    } catch {
      toast.error("Kopiranje ni uspelo");
    }
  }
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-[13.5px] font-bold">
        <CalendarDays className="size-4 text-wine" /> Koledar v telefonu
      </div>
      <p className="text-[12.5px] text-ink-muted mt-1.5 leading-relaxed">
        Dodaj to povezavo v Google ali Apple koledar (»Dodaj koledar po URL-ju«). Obiski se potem sami prikažejo v
        koledarju in se posodabljajo.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 min-w-0 h-9 rounded-[8px] border border-line bg-surface-muted px-2 text-[11.5px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          <Copy className="size-4" /> Kopiraj
        </Button>
      </div>
      <a href={url.replace(/^https?:/, "webcal:")} className="inline-block mt-2 text-[12px] font-semibold text-wine">
        Odpri v koledarju
      </a>
    </Card>
  );
}
