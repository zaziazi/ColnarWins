import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Vessel } from "@/lib/types";

export function VesselSummaryCard({ vessel }: { vessel: Vessel }) {
  const volume = vessel.activeLotVolumeL ?? 0;
  const fillPct = vessel.capacityL > 0 ? Math.min(100, (volume / vessel.capacityL) * 100) : 0;

  return (
    <Link href={`/klet/rezervoarji/${vessel.id}`}>
      <Card className="p-3.5 flex items-center justify-between gap-3 hover:border-line-strong transition-colors">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[15px] truncate">{vessel.name}</h3>
          <p className="text-[11.5px] text-ink-subtle mt-0.5">
            {vessel.activeLotId ? `${vessel.activeLotNumber} · ${vessel.activeLotName}` : "prazen"} ·{" "}
            {volume.toLocaleString("sl-SI")} / {vessel.capacityL.toLocaleString("sl-SI")} l
          </p>
          <div className="mt-2 h-1.5 w-32 rounded-full bg-surface-muted overflow-hidden">
            <div className="h-full bg-wine" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        <ChevronRight className="size-4 text-ink-subtle shrink-0" />
      </Card>
    </Link>
  );
}
