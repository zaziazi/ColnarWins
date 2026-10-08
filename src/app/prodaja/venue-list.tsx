"use client";

import * as React from "react";
import { AlertCircle, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SalesMapPoint } from "@/lib/types";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from "./constants";

const PAGE = 60;

/** Phone-friendly list of the same points the map shows. */
export function VenueList({
  points,
  onSelect,
}: {
  points: SalesMapPoint[];
  onSelect: (p: SalesMapPoint) => void;
}) {
  const [shown, setShown] = React.useState(PAGE);
  React.useEffect(() => setShown(PAGE), [points]);

  const sorted = React.useMemo(
    () =>
      [...points].sort(
        (a, b) =>
          Number(b.needsReview) - Number(a.needsReview) ||
          (a.city ?? "~").localeCompare(b.city ?? "~", "sl") ||
          a.name.localeCompare(b.name, "sl"),
      ),
    [points],
  );

  if (sorted.length === 0) {
    return (
      <Card className="p-5 text-center">
        <p className="text-[13px] text-ink-muted">Ni zadetkov za izbrane filtre.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.slice(0, shown).map((p) => (
        <button key={`${p.source}-${p.id}`} type="button" onClick={() => onSelect(p)} className="w-full text-left">
          <Card className="p-3 hover:border-line-strong transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-[14.5px] truncate">{p.name}</h3>
                <p className="text-[11.5px] text-ink-subtle mt-0.5 truncate">
                  {KIND_LABEL[p.kind]}
                  {p.city && ` · ${p.city}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                {p.needsReview && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn">
                    <AlertCircle className="size-3" /> Za pregled
                  </span>
                )}
              </div>
            </div>
            {(p.phone || p.email) && (
              <div className="flex gap-3 mt-1.5 text-[11.5px] text-ink-muted">
                {p.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" /> {p.phone}
                  </span>
                )}
                {p.email && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail className="size-3" /> {p.email}
                  </span>
                )}
              </div>
            )}
          </Card>
        </button>
      ))}
      {shown < sorted.length && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
          Prikaži več ({sorted.length - shown})
        </Button>
      )}
    </div>
  );
}
