import { dateShort } from "@/lib/format";
import type { WineLotEvent } from "@/lib/types";

export const EVENT_LABEL: Record<WineLotEvent["eventType"], string> = {
  harvest_intake: "Sprejem",
  transfer: "Prenos",
  blend_in: "Zlitje (prejeto)",
  blend_retired: "Zlitje (preneseno)",
  stage_change: "Sprememba faze",
  name_change: "Sprememba imena",
  reading: "Meritev",
  note: "Opomba",
  bottling: "Stekleničenje",
  adjustment: "Popravek",
  addition: "Dodatek",
};

export function eventDetail(e: WineLotEvent): string | null {
  switch (e.eventType) {
    case "harvest_intake":
      return e.toVesselName ? `${e.toVesselName} · +${e.volumeL} l` : null;
    case "transfer":
      return e.fromVesselName && e.toVesselName
        ? `${e.fromVesselName} → ${e.toVesselName} · ${e.volumeL} l`
        : null;
    case "blend_in":
      return [e.relatedLotNumber && `od ${e.relatedLotNumber}`, e.volumeL && `+${e.volumeL} l`]
        .filter(Boolean)
        .join(" · ") || null;
    case "blend_retired":
      return [e.relatedLotNumber && `v ${e.relatedLotNumber}`, e.volumeL && `${e.volumeL} l`]
        .filter(Boolean)
        .join(" · ") || null;
    case "bottling":
      return e.volumeL ? `−${e.volumeL} l` : null;
    case "adjustment":
      return e.volumeL ? `${e.volumeL > 0 ? "+" : ""}${e.volumeL} l` : null;
    case "addition":
      return [e.additiveName, e.amount !== null && `${e.amount}${e.unit ? ` ${e.unit}` : ""}`]
        .filter(Boolean)
        .join(" · ") || null;
    case "reading":
      return (
        [
          e.sugarGl !== null && `sladkor ${e.sugarGl} g/l`,
          e.density !== null && `gostota ${e.density}`,
          e.ph !== null && `pH ${e.ph}`,
          e.alcohol !== null && `alk. ${e.alcohol}%`,
          e.so2 !== null && `SO2 ${e.so2}`,
          e.co2 !== null && `CO2 ${e.co2}`,
          e.malicAcid !== null && `jabolčna ${e.malicAcid}`,
          e.tartaricAcid !== null && `vinska ${e.tartaricAcid}`,
          e.lacticAcid !== null && `mlečna ${e.lacticAcid}`,
          e.totalAcid !== null && `skupna ${e.totalAcid}`,
          e.volatileAcid !== null && `hlapna ${e.volatileAcid}`,
        ]
          .filter(Boolean)
          .join(" · ") || null
      );
    default:
      return null;
  }
}

export function LotHistory({ events }: { events: WineLotEvent[] }) {
  if (events.length === 0) {
    return <p className="p-3.5 text-[13px] text-ink-muted">Ni zgodovine.</p>;
  }

  // Fetched oldest-first (SugarChart needs that order); shown newest-first.
  const newestFirst = [...events].reverse();

  return (
    <div>
      {newestFirst.map((e) => {
        const detail = eventDetail(e);
        return (
          <div key={e.id} className="px-3.5 py-2.5 border-b border-line last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{EVENT_LABEL[e.eventType]}</span>
              <span className="text-[11px] text-ink-subtle shrink-0">
                {dateShort(e.createdAt)}
                {e.createdByName && ` · ${e.createdByName}`}
              </span>
            </div>
            {detail && <p className="text-[12.5px] text-ink-muted mt-0.5">{detail}</p>}
            {e.note && <p className="text-[12.5px] text-ink-muted mt-0.5">{e.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
