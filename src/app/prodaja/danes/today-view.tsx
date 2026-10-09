"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, MessageSquare, Navigation, Phone, Plus, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { announceSms, navigateHref, smsHref } from "@/lib/sales/config";
import { dayMonth, weekdayName } from "@/lib/sales/dates";
import type { CarStockRow, PlannedVisit, SalesMapPoint, SalesProduct } from "@/lib/types";
import { AddToDayDialog } from "../add-to-day";
import { KIND_LABEL } from "../constants";
import { RouteButton } from "../route-button";
import { OUTCOME_LABEL, OUTCOME_TONE } from "../outcome";
import { markAnnounced } from "../teren-actions";
import { VisitDialog } from "./visit-dialog";

export function TodayView({
  today,
  label,
  visits,
  carStock,
  products,
  points,
  origin,
  repName,
}: {
  today: string;
  label: string;
  visits: PlannedVisit[];
  carStock: CarStockRow[];
  products: SalesProduct[];
  points: SalesMapPoint[];
  origin: string;
  repName: string;
}) {
  const router = useRouter();
  const [active, setActive] = React.useState<{ visit: PlannedVisit; mode: "visit" | "order" } | null>(null);
  const [adding, setAdding] = React.useState(false);

  const open = visits.filter((v) => !v.visitedAt);
  const done = visits.filter((v) => v.visitedAt);
  const inCar = carStock.reduce((s, r) => s + r.inCar, 0);
  const plannedKeys = new Set(visits.map((v) => (v.venueId ? `venue:${v.venueId}` : `customer:${v.customerId}`)));

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-card)] bg-wine-soft border border-wine-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-wine">
              {weekdayName(today)} {dayMonth(today)}
            </div>
            <div className="text-[22px] font-bold tracking-[-0.02em] leading-tight mt-0.5 truncate">
              {label ? label.charAt(0).toUpperCase() + label.slice(1) : "Obiski za danes"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[26px] font-bold tracking-[-0.02em] leading-none tabular">
              {done.length}
              <span className="text-ink-subtle text-[18px]"> / {visits.length}</span>
            </div>
            <div className="text-[11.5px] text-ink-muted mt-1">obiskanih</div>
          </div>
        </div>
        <div
          className="mt-3 h-1.5 rounded-full bg-white/80 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={visits.length}
          aria-valuenow={done.length}
        >
          <div className="h-full rounded-full bg-wine transition-all" style={{ width: `${visits.length ? (done.length / visits.length) * 100 : 0}%` }} />
        </div>
        <Link href="/prodaja/zaloga" className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-muted hover:text-ink">
          <Wine className="size-4 text-wine" />
          {inCar > 0 ? `V avtu: ${inCar} steklenic za vzorce` : "V avtu ni vzorcev"}
        </Link>
      </div>

      {visits.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">Za danes ni načrtovanih obiskov.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/prodaja/teden">Odpri načrt</Link>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Dodaj lokale
            </Button>
          </div>
        </Card>
      )}

      {open.length > 0 && <RouteButton stops={open} />}

      {open.map((v) => (
        <StopCard key={v.id} v={v} origin={origin} repName={repName} onVisit={() => setActive({ visit: v, mode: "visit" })} />
      ))}

      {done.length > 0 && <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle pt-1">Opravljeno</div>}
      {done.map((v) => (
        <DoneCard key={v.id} v={v} onOrder={() => setActive({ visit: v, mode: "order" })} />
      ))}

      {visits.length > 0 && (
        <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Dodaj še lokal za danes
        </Button>
      )}

      {active && (
        <VisitDialog
          key={active.visit.id + active.mode}
          visit={active.visit}
          mode={active.mode}
          today={today}
          carStock={carStock}
          products={products}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            router.refresh();
          }}
        />
      )}

      <AddToDayDialog
        open={adding}
        onOpenChange={setAdding}
        date={today}
        points={points}
        plannedKeys={plannedKeys}
        suggestedTown={label || null}
      />
    </div>
  );
}

function StopCard({ v, origin, repName, onVisit }: { v: PlannedVisit; origin: string; repName: string; onVisit: () => void }) {
  const router = useRouter();
  const offerUrl = `${origin}/ponudba/${v.offerToken}`;
  const sms = v.phone ? smsHref(v.phone, announceSms({ repName, offerUrl })) : null;

  function log(via: "sms" | "call") {
    // fire and forget — the phone's own app takes over right after
    void markAnnounced(v.id, via).then(() => router.refresh());
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[15px] leading-snug">{v.name}</div>
          <div className="text-[12px] text-ink-subtle mt-0.5">
            {[v.kind ? KIND_LABEL[v.kind] : null, v.address, v.city].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {v.plannedTime && <Badge tone="info">{v.plannedTime}</Badge>}
          {v.isCustomer && <Badge tone="good">stranka</Badge>}
        </div>
      </div>

      {(v.announcedAt || v.offerOpenCount > 0 || v.knownContact) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.announcedAt && (
            <Badge tone="info">
              <Check className="size-3" /> najava ({v.announcedVia === "call" ? "klic" : "SMS"})
            </Badge>
          )}
          {v.offerOpenCount > 0 && (
            <Badge tone="good">
              <Eye className="size-3" /> ponudba odprta
            </Badge>
          )}
          {v.knownContact && <Badge>kontakt: {v.knownContact}</Badge>}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {v.lat !== null && v.lng !== null ? (
          <Button asChild variant="secondary" size="sm">
            <a href={navigateHref(v.lat, v.lng)} target="_blank" rel="noreferrer">
              <Navigation className="size-4" /> Pelji me
            </a>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <Navigation className="size-4" /> Pelji me
          </Button>
        )}
        {v.phone ? (
          <Button asChild variant="secondary" size="sm">
            <a href={`tel:${v.phone}`} onClick={() => !v.announcedAt && log("call")}>
              <Phone className="size-4" /> Pokliči
            </a>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <Phone className="size-4" /> Pokliči
          </Button>
        )}
        {sms ? (
          <Button asChild variant="secondary" size="sm">
            <a href={sms} onClick={() => log("sms")}>
              <MessageSquare className="size-4" /> SMS
            </a>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            <MessageSquare className="size-4" /> SMS
          </Button>
        )}
      </div>

      <Button className="w-full mt-2" onClick={onVisit}>
        Zabeleži obisk
      </Button>
    </Card>
  );
}

function DoneCard({ v, onOrder }: { v: PlannedVisit; onOrder: () => void }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[14px] truncate">{v.name}</div>
          <div className="text-[12px] text-ink-subtle">
            {v.contactName && `Kontakt: ${v.contactName}`}
            {v.followUpOn && `${v.contactName ? " · " : ""}nadaljnji obisk ${dayMonth(v.followUpOn)}`}
          </div>
          {v.note && <div className="text-[12.5px] text-ink-muted mt-1 leading-relaxed">{v.note}</div>}
        </div>
        {v.outcome && <Badge tone={OUTCOME_TONE[v.outcome]}>{OUTCOME_LABEL[v.outcome]}</Badge>}
      </div>
      {v.orderId ? (
        <Link href="/pisarna" className="inline-block mt-2 text-[12.5px] font-semibold text-wine">
          Odpri naročilo →
        </Link>
      ) : (
        v.outcome !== "no_interest" &&
        v.outcome !== "not_there" && (
          <Button size="sm" variant="secondary" className="mt-2" onClick={onOrder}>
            <Plus className="size-4" /> Dodaj naročilo
          </Button>
        )
      )}
    </Card>
  );
}
