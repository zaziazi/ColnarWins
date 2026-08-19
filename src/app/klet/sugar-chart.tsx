"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { dateShort } from "@/lib/format";
import { eventDetail } from "./lot-history";
import type { WineLot, WineLotEvent } from "@/lib/types";

const DAY_MS = 86_400_000;

/**
 * AWRI's fermentation calculator guideline (awri.com.au): a healthy
 * ferment drops sugar at roughly 1° Baumé/day (~17 g/l/day) over a
 * typical 7–14 day fermentation, and their stuck-ferment fact sheet
 * flags anything sustaining under 1 g/l/day as needing attention.
 * These two numbers are the only ones sourced from AWRI — everything
 * else here (10-day reference span, the exact 17/1 cutoffs for the
 * status label) is a direct application of them, not a separate guess.
 */
const AWRI_RATE_GL_PER_DAY = 17;
const AWRI_REFERENCE_DAYS = 10;
const AWRI_STUCK_THRESHOLD_GL_PER_DAY = 1;

/**
 * Sugar over time — reads as consumption during fermentation since the
 * value drops as sugar converts to alcohol. Tap a point to see everything
 * recorded on that reading, not just the sugar value. X-axis is real
 * elapsed time (not reading order) so the AWRI reference line — shown
 * only while the lot is in Vrenje — lines up correctly against it.
 */
export function SugarChart({ events, stage }: { events: WineLotEvent[]; stage: WineLot["stage"] }) {
  const points = events
    .filter((e): e is WineLotEvent & { sugarGl: number } => e.sugarGl !== null)
    .map((e) => ({ ...e, t: new Date(e.createdAt).getTime() }));
  const [selected, setSelected] = React.useState<number | null>(null);

  if (points.length < 2) return null;

  // Current Vrenje window: the most recent "→ Vrenje" stage change, so a
  // lot that later reverts and re-enters Vrenje still anchors on the
  // active run, not a stale earlier one.
  let vrenjeStartT: number | null = null;
  if (stage === "vrenje") {
    for (const e of events) {
      if (e.eventType === "stage_change" && e.note?.includes("→ Vrenje")) {
        vrenjeStartT = new Date(e.createdAt).getTime();
      }
    }
    if (vrenjeStartT === null && events.length > 0) {
      vrenjeStartT = new Date(events[0].createdAt).getTime();
    }
  }

  const anchor = vrenjeStartT !== null ? points.find((p) => p.t >= vrenjeStartT!) : undefined;
  const reference =
    anchor !== undefined
      ? [
          { t: anchor.t, value: anchor.sugarGl },
          { t: anchor.t + AWRI_REFERENCE_DAYS * DAY_MS, value: Math.max(0, anchor.sugarGl - AWRI_RATE_GL_PER_DAY * AWRI_REFERENCE_DAYS) },
        ]
      : null;

  // Status from the last two readings within the current Vrenje window.
  let status: { label: string; tone: "good" | "warn" | "danger" } | null = null;
  if (vrenjeStartT !== null) {
    const inWindow = points.filter((p) => p.t >= vrenjeStartT!);
    if (inWindow.length >= 2) {
      const prev = inWindow[inWindow.length - 2];
      const last = inWindow[inWindow.length - 1];
      const days = (last.t - prev.t) / DAY_MS;
      const rate = days > 0 ? (prev.sugarGl - last.sugarGl) / days : 0;
      if (rate >= AWRI_RATE_GL_PER_DAY) status = { label: "Optimalno", tone: "good" };
      else if (rate >= AWRI_STUCK_THRESHOLD_GL_PER_DAY) status = { label: "Počasi", tone: "warn" };
      else status = { label: "Zastalo", tone: "danger" };
    }
  }

  const width = 600;
  const height = 160;
  const padX = 14;
  const padTop = 12;
  const padBottom = 24;

  const allT = [...points.map((p) => p.t), ...(reference?.map((r) => r.t) ?? [])];
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);
  const tRange = tMax - tMin || 1;

  const allValues = [...points.map((p) => p.sugarGl), ...(reference?.map((r) => r.value) ?? [])];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const x = (t: number) => padX + ((t - tMin) / tRange) * (width - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / range) * (height - padTop - padBottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.sugarGl)}`).join(" ");
  const referencePath = reference ? reference.map((r, i) => `${i === 0 ? "M" : "L"} ${x(r.t)} ${y(r.value)}`).join(" ") : null;
  const selectedPoint = selected !== null ? points[selected] : null;

  return (
    <div>
      {status && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-ink-subtle">Tempo vrenja (AWRI)</span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        {referencePath && (
          <path
            d={referencePath}
            fill="none"
            stroke="var(--color-ink-subtle)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={path} fill="none" stroke="var(--color-wine)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={p.id} onClick={() => setSelected(i)} className="cursor-pointer">
            {/* generous invisible hit target for touch */}
            <circle cx={x(p.t)} cy={y(p.sugarGl)} r={14} fill="transparent" />
            <circle
              cx={x(p.t)}
              cy={y(p.sugarGl)}
              r={selected === i ? 6 : 3.5}
              fill="var(--color-wine)"
              stroke={selected === i ? "var(--color-surface)" : "none"}
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>

      <div className="flex items-center justify-between text-[11px] text-ink-subtle mt-1">
        <span>{dateShort(new Date(tMin))}</span>
        <span>{dateShort(new Date(tMax))}</span>
      </div>

      {reference && (
        <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-wine" /> Dejansko
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 border-t border-dashed border-ink-subtle" /> Optimalno (AWRI)
          </span>
        </div>
      )}

      {selectedPoint && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">Meritev</span>
            <span className="text-[11px] text-ink-subtle shrink-0">
              {dateShort(selectedPoint.createdAt)}
              {selectedPoint.createdByName && ` · ${selectedPoint.createdByName}`}
            </span>
          </div>
          <p className="text-[12.5px] text-ink-muted mt-0.5">{eventDetail(selectedPoint)}</p>
          {selectedPoint.note && <p className="text-[12.5px] text-ink-muted mt-0.5">{selectedPoint.note}</p>}
        </div>
      )}
    </div>
  );
}
