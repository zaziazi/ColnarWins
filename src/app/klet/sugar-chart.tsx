import { dateShort } from "@/lib/format";
import type { WineLotEvent } from "@/lib/types";

/**
 * Sugar over time — reads as consumption during fermentation since the
 * value drops as sugar converts to alcohol. Points are spaced evenly by
 * reading order, not true elapsed time; good enough for a handful of
 * cellar checks and avoids date-scaling edge cases.
 */
export function SugarChart({ events }: { events: WineLotEvent[] }) {
  const points = events
    .filter((e): e is WineLotEvent & { sugarGl: number } => e.sugarGl !== null)
    .map((e) => ({ value: e.sugarGl, date: e.createdAt }));

  if (points.length < 2) return null;

  const width = 600;
  const height = 160;
  const padX = 8;
  const padTop = 12;
  const padBottom = 24;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / range) * (height - padTop - padBottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--color-wine)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--color-wine)" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-ink-subtle mt-1">
        <span>{dateShort(points[0].date)}</span>
        <span>{dateShort(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
