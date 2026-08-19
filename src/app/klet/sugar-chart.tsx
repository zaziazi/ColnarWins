"use client";

import * as React from "react";
import { dateShort } from "@/lib/format";
import { eventDetail } from "./lot-history";
import type { WineLotEvent } from "@/lib/types";

/**
 * Sugar over time — reads as consumption during fermentation since the
 * value drops as sugar converts to alcohol. Points are spaced evenly by
 * reading order, not true elapsed time; good enough for a handful of
 * cellar checks and avoids date-scaling edge cases. Tap a point to see
 * everything recorded on that reading, not just the sugar value.
 */
export function SugarChart({ events }: { events: WineLotEvent[] }) {
  const points = events.filter((e): e is WineLotEvent & { sugarGl: number } => e.sugarGl !== null);
  const [selected, setSelected] = React.useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 600;
  const height = 160;
  const padX = 14;
  const padTop = 12;
  const padBottom = 24;

  const values = points.map((p) => p.sugarGl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / range) * (height - padTop - padBottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.sugarGl)}`).join(" ");
  const selectedPoint = selected !== null ? points[selected] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--color-wine)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={p.id} onClick={() => setSelected(i)} className="cursor-pointer">
            {/* generous invisible hit target for touch */}
            <circle cx={x(i)} cy={y(p.sugarGl)} r={14} fill="transparent" />
            <circle
              cx={x(i)}
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
        <span>{dateShort(points[0].createdAt)}</span>
        <span>{dateShort(points[points.length - 1].createdAt)}</span>
      </div>

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
