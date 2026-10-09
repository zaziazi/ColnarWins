"use client";

import { Star } from "lucide-react";
import type { GoogleLookup } from "@/lib/google-places";

const PRICE = ["", "€", "€€", "€€€", "€€€€"];

/** One compact line: ★ 4,3 · 792 ocen · €€. Renders nothing when Google is not set up. */
export function GoogleLine({ lookup, loading }: { lookup?: GoogleLookup; loading?: boolean }) {
  if (lookup?.status === "unconfigured") return null;
  if (!lookup) {
    return loading ? <div className="mt-1.5 h-4 w-40 rounded bg-surface-muted animate-pulse" aria-label="Nalaganje Google ocene" /> : null;
  }
  if (lookup.status === "notfound") return <div className="mt-1 text-[11.5px] text-ink-subtle">Google: lokala ni našel</div>;
  if (lookup.status !== "ok") return null;

  const g = lookup.info;
  if (g.closed === "permanently") return <div className="mt-1 text-[12px] font-semibold text-danger">Google: trajno zaprto</div>;
  if (g.rating === null) return <div className="mt-1 text-[11.5px] text-ink-subtle">Google: brez ocen</div>;

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[12.5px]">
      <Star className="size-3.5 text-warn fill-warn" />
      <span className="font-bold tabular">{g.rating.toFixed(1).replace(".", ",")}</span>
      <span className="text-ink-muted">
        {g.ratingCount !== null && `${g.ratingCount} ocen`}
        {g.priceLevel !== null && g.priceLevel > 0 && ` · ${PRICE[g.priceLevel]}`}
      </span>
      {g.closed === "temporarily" && <span className="text-warn font-semibold">· začasno zaprto</span>}
    </div>
  );
}
