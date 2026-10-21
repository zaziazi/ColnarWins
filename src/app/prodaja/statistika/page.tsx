import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { eur, flasa } from "@/lib/format";
import { addDays, dayMonth, todayIso } from "@/lib/sales/dates";
import { getSalesStats, type PeriodNumbers, type StatsRange } from "@/lib/sales/stats";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PlanButton } from "../plan-button";

export const dynamic = "force-dynamic";

const RANGES: { key: StatsRange; label: string }[] = [
  { key: "week", label: "Ta teden" },
  { key: "month", label: "Ta mesec" },
  { key: "90", label: "90 dni" },
];

/** What the salesperson did and closed, and what still needs a follow-up. */
export default async function SalesStatsPage({ searchParams }: { searchParams: Promise<{ r?: string; p?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) {
    return (
      <AppShell title="Statistika" who="Prijava potrebna" section="prodaja">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Ta stran je na voljo samo prodaji in vodstvu.</p>
        </Card>
      </AppShell>
    );
  }

  const q = await searchParams;
  const range: StatsRange = q.r === "month" ? "month" : q.r === "90" ? "90" : "week";
  const supabase = await createClient();
  const today = todayIso();

  // managers can look at any salesperson; a salesperson always sees their own numbers
  const { data: reps } = await supabase.from("staff").select("id,full_name").eq("role", "sales").eq("active", true).order("full_name");
  const repList = (reps ?? []) as { id: string; full_name: string }[];
  const picked = staff.role === "manager" ? (repList.find((r) => r.id === q.p)?.id ?? repList[0]?.id ?? staff.id) : staff.id;
  const pickedName = staff.role === "manager" ? (repList.find((r) => r.id === picked)?.full_name ?? staff.fullName) : staff.fullName;

  const s = await getSalesStats(supabase, picked, range, today);
  const c = s.current;
  const p = s.previous;
  const conv = c.met > 0 ? Math.round((c.ordered / c.met) * 100) : 0;
  const maxDay = Math.max(1, ...s.perDay.map((d) => d.count));
  const late = s.followUps.filter((f) => f.followUpOn < today);
  const dueToday = s.followUps.filter((f) => f.followUpOn === today);
  const later = s.followUps.filter((f) => f.followUpOn > today);

  const href = (r: StatsRange) => `/prodaja/statistika?r=${r}${staff.role === "manager" ? `&p=${picked}` : ""}`;

  return (
    <AppShell
      title="Statistika prodaje"
      subtitle={staff.role === "manager" ? pickedName : "Tvoji obiski, zaprta naročila in kaj še čaka"}
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="prodaja"
      wide
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {RANGES.map((x) => (
          <Link
            key={x.key}
            href={href(x.key)}
            className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border inline-flex items-center", range === x.key ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}
          >
            {x.label}
          </Link>
        ))}
        {staff.role === "manager" && repList.length > 1 && (
          <span className="ml-2 flex flex-wrap gap-1.5">
            {repList.map((r) => (
              <Link key={r.id} href={`/prodaja/statistika?r=${range}&p=${r.id}`} className={cn("h-9 px-3 rounded-full text-[13px] font-semibold border inline-flex items-center", r.id === picked ? "border-wine text-wine" : "border-line text-ink-muted")}>
                {r.full_name}
              </Link>
            ))}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 min-[900px]:grid-cols-5 gap-2.5 mb-4">
        <Stat label="Obiski" value={String(c.visits)} delta={c.visits - p.visits} hint={`${c.met} srečanj`} />
        <Stat label="Zaprto (naročila)" value={String(c.ordered)} delta={c.ordered - p.ordered} hint={eur(c.orderValue)} good />
        <Stat label="Uspešnost" value={`${conv} %`} hint="naročila od vseh srečanj" />
        <Stat label="Razmislili bodo" value={String(c.thinking)} delta={c.thinking - p.thinking} hint="še ni zaprto" warn={c.thinking > 0} />
        <Stat label="Vzorci" value={flasa(c.sampleBottles)} hint="steklenic natočenih" />
      </div>

      <Card className="p-3.5 mb-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2">Obiski po dnevih</p>
        <div className="flex items-end gap-[3px] h-16" aria-hidden="true">
          {s.perDay.map((d) => (
            <div key={d.date} className="flex-1 min-w-[3px] flex flex-col justify-end h-full" title={`${dayMonth(d.date)}: ${d.count} obiskov, ${d.ordered} naročil`}>
              <div className={cn("rounded-t-[2px]", d.ordered > 0 ? "bg-good" : "bg-wine/70")} style={{ height: `${d.count === 0 ? 2 : Math.max(8, (d.count / maxDay) * 100)}%`, opacity: d.count === 0 ? 0.25 : 1 }} />
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-subtle mt-2">Zeleno: dan z vsaj enim zaprtim naročilom. Primerjava (↑ ↓) je s prejšnjim enako dolgim obdobjem.</p>
      </Card>

      <section className="mb-6">
        <Heading>Odprto: kdo je razmislil in še čaka nate ({s.followUps.length})</Heading>
        {s.followUps.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-[13px] text-ink-muted">Nič ni odprtega. Ko pri obisku izbereš »Razmislili bodo«, se stranka pojavi tukaj in na telefon dobiš opomnik na dan nadaljnjega obiska.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2.5">
            {[...late, ...dueToday, ...later].map((f) => {
              const days = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${f.followUpOn}T12:00:00Z`).getTime()) / 86400000);
              return (
                <Card key={f.visitId} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px] truncate">{f.name}</p>
                      <p className="text-[11.5px] text-ink-subtle mt-0.5">{[f.city, `nadaljnji obisk ${dayMonth(f.followUpOn)}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    {days > 0 ? <Badge tone="danger">zamuja {days} dni</Badge> : days === 0 ? <Badge tone="warn">danes</Badge> : <Badge>čez {-days} dni</Badge>}
                  </div>
                  {f.note && <p className="text-[12.5px] text-ink-muted mt-2">{f.note}</p>}
                  <div className="mt-3">
                    {f.planned ? <Badge tone="good">Že v načrtu</Badge> : f.venueId ? <PlanButton target={{ venueId: f.venueId }} /> : f.customerId ? <PlanButton target={{ customerId: f.customerId }} /> : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6">
        <Heading>Zaprto: naročila ({s.closed.length})</Heading>
        <Card>
          {s.closed.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-muted">V tem obdobju še ni zaprtih naročil.</p>
          ) : (
            s.closed.map((d, i) => (
              <div key={d.visitId} className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", i < s.closed.length - 1 && "border-b border-line")}>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold truncate">{d.name}</p>
                  <p className="text-[11.5px] text-ink-subtle">{[d.city, dayMonth(new Date(d.at).toISOString().slice(0, 10))].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-[13.5px] font-bold tabular text-good-ink">{eur(d.value)}</span>
              </div>
            ))
          )}
        </Card>
      </section>

      {s.notClosed.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Ne zanima ({s.notClosed.length})</summary>
          <Card>
            {s.notClosed.map((d, i) => (
              <div key={d.visitId} className={cn("px-3.5 py-2.5", i < s.notClosed.length - 1 && "border-b border-line")}>
                <p className="text-[13.5px] font-semibold">{d.name}</p>
                <p className="text-[11.5px] text-ink-subtle">{[d.city, d.note].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </Card>
        </details>
      )}
    </AppShell>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{children}</h2>;
}

function Stat({ label, value, hint, delta, good, warn }: { label: string; value: string; hint?: string; delta?: number; good?: boolean; warn?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border bg-surface p-3.5", warn ? "border-warn" : "border-line")}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</p>
      <p className={cn("text-[22px] font-bold tabular mt-1", good && "text-good-ink")}>
        {value}
        {delta !== undefined && delta !== 0 && (
          <span className={cn("ml-1.5 text-[12px] font-semibold", delta > 0 ? "text-good-ink" : "text-ink-subtle")}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
          </span>
        )}
      </p>
      {hint && <p className="text-[11.5px] text-ink-subtle mt-0.5">{hint}</p>}
    </div>
  );
}

export type { PeriodNumbers };
