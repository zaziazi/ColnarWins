"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Users, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dayMonth, weekdayName } from "@/lib/sales/dates";
import type { DegustacijaPerson, GroupBooking } from "@/lib/types";
import { BookingDialog } from "./booking-dialog";

const PX_PER_HOUR = 56;
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const dowOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

interface Placed {
  b: GroupBooking;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for bookings that overlap in time within one day. */
function place(bookings: GroupBooking[], startMin: number): Placed[] {
  const items = bookings
    .filter((b) => b.startTime)
    .map((b) => {
      const s = mins(b.startTime!);
      const e = b.endTime ? mins(b.endTime) : s + 120;
      return { b, s, e: Math.max(e, s + 30) };
    })
    .sort((a, c) => a.s - c.s || a.e - c.e);

  const out: Placed[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.e);
      } else laneEnds[lane] = it.e;
      return { it, lane };
    });
    for (const { it, lane } of assigned) {
      out.push({
        b: it.b,
        top: ((it.s - startMin) / 60) * PX_PER_HOUR,
        height: Math.max(34, ((it.e - it.s) / 60) * PX_PER_HOUR - 2),
        lane,
        lanes: laneEnds.length,
      });
    }
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-wine-soft border-wine text-ink",
  tentative: "bg-warn-soft border-warn border-dashed text-ink",
  visited: "bg-good-soft border-good text-ink",
};

export function Calendar({
  today,
  anchor,
  days,
  bookings,
  persons,
  hostingWeekdays,
  blackoutDates,
  initialView,
}: {
  today: string;
  anchor: string;
  days: string[];
  bookings: GroupBooking[];
  persons: DegustacijaPerson[];
  hostingWeekdays: number[];
  blackoutDates: string[];
  initialView: "day" | "week" | null;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<"day" | "week">(initialView ?? "week");
  const [open, setOpen] = React.useState<GroupBooking | null>(null);

  // phones start on the day view, larger screens on the week
  React.useEffect(() => {
    if (initialView === null && window.matchMedia("(max-width: 767px)").matches) setView("day");
  }, [initialView]);

  const visible = bookings.filter((b) => b.status !== "cancelled");
  const shownDays = view === "week" ? days : [days.includes(anchor) ? anchor : days[0]];

  let startHour = 8;
  let endHour = 20;
  for (const b of visible) {
    if (b.startTime) startHour = Math.min(startHour, Math.floor(mins(b.startTime) / 60));
    const e = b.endTime ?? b.startTime;
    if (e) endHour = Math.max(endHour, Math.ceil(mins(e) / 60) + 1);
  }
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * PX_PER_HOUR;

  const go = (iso: string) => router.push(`/degustacije/koledar?d=${iso}&v=${view}`);
  const step = view === "week" ? 7 : 1;

  function newAt(date: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = startHour * 60 + Math.round((((e.clientY - rect.top) / PX_PER_HOUR) * 60) / 30) * 30;
    const t = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    router.push(`/degustacije/nova?datum=${date}&ura=${t}`);
  }

  const title =
    view === "week"
      ? `${dayMonth(days[0])} – ${dayMonth(days[6])}`
      : `${weekdayName(shownDays[0])}, ${dayMonth(shownDays[0])}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => go(addDays(shownDays[0], -step))} aria-label="Nazaj">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => go(addDays(shownDays[0], step))} aria-label="Naprej">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go(today)}>
            Danes
          </Button>
        </div>
        <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5" role="group" aria-label="Pogled">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`h-8 px-3 rounded-[8px] text-[12.5px] font-semibold ${view === v ? "bg-wine text-white" : "text-ink-muted"}`}
            >
              {v === "day" ? "Dan" : "Teden"}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[15px] font-bold mb-2">{title}</div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: view === "week" ? 720 : undefined }}>
            {/* day headers */}
            <div className="grid border-b border-line bg-surface-muted" style={{ gridTemplateColumns: `44px repeat(${shownDays.length}, minmax(0, 1fr))` }}>
              <div />
              {shownDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setView("day");
                    router.push(`/degustacije/koledar?d=${d}&v=day`);
                  }}
                  className={`py-2 text-center border-l border-line ${d === today ? "text-wine font-bold" : "text-ink-muted"}`}
                >
                  <div className="text-[11px] uppercase tracking-[0.06em]">{weekdayName(d).slice(0, 3)}</div>
                  <div className="text-[15px] font-bold">{new Date(`${d}T12:00:00Z`).getUTCDate()}.</div>
                </button>
              ))}
            </div>

            {/* grid */}
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(${shownDays.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height }}>
                {hours.map((h, i) => (
                  <div key={h} className="absolute right-1.5 text-[10.5px] text-ink-subtle -translate-y-1/2" style={{ top: i * PX_PER_HOUR }}>
                    {i === 0 ? "" : `${h}:00`}
                  </div>
                ))}
              </div>
              {shownDays.map((d) => {
                const closed = !hostingWeekdays.includes(dowOf(d)) || blackoutDates.includes(d);
                const placed = place(visible.filter((b) => b.visitDate === d), startHour * 60);
                return (
                  <div
                    key={d}
                    className={`relative border-l border-line cursor-pointer ${closed ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.03)_6px,rgba(0,0,0,0.03)_12px)]" : ""} ${d === today ? "bg-wine-soft/30" : ""}`}
                    style={{ height }}
                    onClick={(e) => newAt(d, e)}
                    role="button"
                    aria-label={`Nova degustacija ${d}`}
                  >
                    {hours.map((h, i) => (
                      <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * PX_PER_HOUR }} />
                    ))}
                    {placed.map(({ b, top, height: h, lane, lanes }) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(b);
                        }}
                        className={`absolute rounded-[8px] border-l-4 border px-1.5 py-1 text-left overflow-hidden ${STATUS_STYLE[b.status] ?? STATUS_STYLE.confirmed}`}
                        style={{ top, height: h, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                      >
                        <div className="text-[11px] font-bold leading-tight">
                          {b.startTime}
                          {b.endTime && `–${b.endTime}`}
                        </div>
                        <div className="text-[11.5px] font-semibold leading-tight truncate">{b.groupName}</div>
                        {h > 52 && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                            {b.peoplePlanned !== null && (
                              <span className="inline-flex items-center gap-0.5">
                                <Users className="size-3" />
                                {b.peoplePlanned}
                              </span>
                            )}
                            {b.food && <Utensils className="size-3" />}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11.5px] text-ink-subtle mt-2">
        Tapni na prosto polje za novo degustacijo ob tisti uri. Črtkana ozadja so dnevi brez skupin. Okvirne rezervacije so črtkane.
      </p>

      {open && <BookingDialog key={open.id} booking={open} persons={persons} onClose={() => setOpen(null)} />}
    </div>
  );
}
