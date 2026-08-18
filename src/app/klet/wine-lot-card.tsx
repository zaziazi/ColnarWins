import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { WineLot } from "@/lib/types";

const STAGE_LABEL: Record<WineLot["stage"], string> = {
  most: "Mošt",
  vrenje: "Vrenje",
  vino: "Vino",
};

const STAGE_TONE: Record<WineLot["stage"], "warn" | "info" | "good"> = {
  most: "warn",
  vrenje: "info",
  vino: "good",
};

export function WineLotCard({ lot }: { lot: WineLot }) {
  return (
    <Link href={`/klet/vino/${lot.id}`}>
      <Card className="p-3.5 flex items-center justify-between gap-3 hover:border-line-strong transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-ink-subtle tabular shrink-0">{lot.lotNumber}</span>
            <h3 className="font-semibold text-[15px] truncate">{lot.name}</h3>
          </div>
          <p className="text-[11.5px] text-ink-subtle mt-0.5">
            {lot.vesselName ?? "—"} · {lot.volumeL.toLocaleString("sl-SI")} l
          </p>
        </div>
        <Badge tone={STAGE_TONE[lot.stage]}>{STAGE_LABEL[lot.stage]}</Badge>
        <ChevronRight className="size-4 text-ink-subtle shrink-0" />
      </Card>
    </Link>
  );
}
