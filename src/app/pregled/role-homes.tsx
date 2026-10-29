import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Heading, Stat } from "@/components/stat";
import { getDeliveryDays, todayIso as deliveryToday, type DayOrder } from "@/lib/delivery-days";
import { getCurrentStaff, getOrders } from "@/lib/data";
import { dateSl, eur, flasa } from "@/lib/format";
import { addDays, dayMonth, monthStart, todayIso } from "@/lib/sales/dates";
import { getSalesStats } from "@/lib/sales/stats";
import { getRepCustomers, getRepWork } from "@/lib/sales/work";
import { NewCustomerButton } from "@/app/prodaja/stranke/new-customer";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Staff = NonNullable<Awaited<ReturnType<typeof getCurrentStaff>>>;

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 11 ? "Dobro jutro" : h < 18 ? "Dober dan" : "Dober večer";
}

function Shell({ staff, subtitle, children }: { staff: Staff; subtitle: string; children: React.ReactNode }) {
  return (
    <AppShell
      title={`${greeting()}, ${staff.fullName}`}
      subtitle={`${dateSl(new Date(`${todayIso()}T12:00:00`))} · ${subtitle}`}
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="dashboard"
      wide
    >
      {children}
    </AppShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-5 text-center">
      <p className="text-[13px] text-ink-muted">{children}</p>
    </Card>
  );
}

const done = (o: DayOrder) => o.lines.length > 0 && o.lines.every((l) => l.delivered);

function DeliveryList({ orders, empty }: { orders: DayOrder[]; empty: string }) {
  if (orders.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Card className="divide-y divide-line">
      {orders.map((o) => (
        <Link key={o.orderId} href="/dostava" className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
          <div className="min-w-0 flex-1">
            <p className={cn("text-[14.5px] font-semibold truncate", done(o) && "line-through text-ink-subtle")}>{o.customerName}</p>
            <p className="text-[12.5px] text-ink-muted mt-0.5 truncate">{[o.city, o.lines.map((l) => `${l.quantity}× ${l.productName}`).join(" · ")].filter(Boolean).join(" · ")}</p>
          </div>
          {done(o) ? <Badge tone="good">Dostavljeno</Badge> : <Badge tone="warn">Čaka</Badge>}
          <ChevronRight className="size-4 text-ink-subtle shrink-0" />
        </Link>
      ))}
    </Card>
  );
}

const daysSince = (iso: string, today: string) => Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${iso}T12:00:00Z`).getTime()) / 86400000);

/* ------------------------------------------------------------------ prodaja */

/** The salesperson's own page: this week's numbers, today's work, the month's orders and deliveries, and the customers who have gone quiet. */
export async function SalesHome({ staff }: { staff: Staff }) {
  const supabase = await createClient();
  const today = todayIso();
  const [stats, work, customers, days] = await Promise.all([
    getSalesStats(supabase, staff.id, "week", today),
    getRepWork(supabase, staff.id, monthStart(today), today, today),
    getRepCustomers(supabase, staff.id),
    getDeliveryDays({ ahead: 1 }),
  ]);
  const c = stats.current;
  const p = stats.previous;
  const conv = c.met > 0 ? Math.round((c.ordered / c.met) * 100) : 0;
  const myToday = (days.find((d) => d.date === deliveryToday())?.orders ?? []).filter((o) => !o.cancelled && o.driverId === staff.id);
  const myDone = myToday.filter(done).length;
  const late = stats.followUps.filter((f) => f.followUpOn < today);
  const dueToday = stats.followUps.filter((f) => f.followUpOn === today);
  const attention = [...late, ...dueToday];
  const quiet = [...customers].sort((a, b) => (a.lastOrderOn ?? "").localeCompare(b.lastOrderOn ?? "") || a.name.localeCompare(b.name, "sl")).slice(0, 6);

  return (
    <Shell staff={staff} subtitle="tvoje delo in tvoje stranke">
      <div className="flex flex-wrap gap-2 mb-5">
        <NewCustomerButton />
        <Link href="/pisarna/novo" className="h-9 px-3.5 rounded-full text-[13px] font-semibold border border-line bg-surface text-ink-muted inline-flex items-center">Novo naročilo</Link>
      </div>
      <Heading>Ta teden</Heading>
      <div className="grid grid-cols-2 min-[900px]:grid-cols-5 gap-2.5 mb-2">
        <Stat label="Obiski" value={String(c.visits)} delta={c.visits - p.visits} hint={`${c.met} srečanj`} />
        <Stat label="Zaprto" value={String(c.ordered)} delta={c.ordered - p.ordered} hint={eur(c.orderValue)} good />
        <Stat label="Uspešnost" value={`${conv} %`} hint="naročila od srečanj" />
        <Stat label="Razmislili bodo" value={String(c.thinking)} delta={c.thinking - p.thinking} hint="še ni zaprto" warn={c.thinking > 0} />
        <Stat label="Vzorci" value={flasa(c.sampleBottles)} hint="steklenic natočenih" />
      </div>
      <Link href="/prodaja/statistika" className="inline-block text-[12.5px] font-semibold text-wine mb-6">Celotna statistika →</Link>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6 mb-6">
        <section>
          <Heading>Kaj te čaka danes</Heading>
          {attention.length === 0 ? (
            <Empty>Nobenega nadaljnjega obiska ni v zamudi. Dobro.</Empty>
          ) : (
            <Card className="divide-y divide-line">
              {attention.slice(0, 6).map((f) => {
                const d = daysSince(f.followUpOn, today);
                return (
                  <Link key={f.visitId} href="/prodaja/statistika" className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold truncate">{f.name}</p>
                      <p className="text-[12.5px] text-ink-muted mt-0.5 truncate">{[f.city, f.note].filter(Boolean).join(" · ") || "nadaljnji obisk"}</p>
                    </div>
                    {d > 0 ? <Badge tone="danger">zamuja {d} dni</Badge> : <Badge tone="warn">danes</Badge>}
                  </Link>
                );
              })}
            </Card>
          )}
          {attention.length > 6 && <p className="text-[12px] text-ink-subtle mt-1.5 px-0.5">Še {attention.length - 6} drugih v Statistiki.</p>}
        </section>

        <section>
          <Heading>Dostave, ki jih voziš danes ({myDone} / {myToday.length})</Heading>
          <DeliveryList orders={myToday} empty="Danes ti ni dodeljena nobena dostava." />
        </section>
      </div>

      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">Ta mesec: naročila in dostave</h2>
        <Link href="/prodaja/narocila" className="text-[12.5px] font-semibold text-wine shrink-0">Moja naročila →</Link>
      </div>
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-2.5 mb-6">
        <Stat label="Naročila mojih strank" value={String(work.customerOrders.count)} hint={Object.entries(work.customerOrders.byStatus).map(([k, n]) => `${n} ${(statusLabel[k as keyof typeof statusLabel] ?? k).toLowerCase()}`).join(" · ") || `${work.customerCount} strank`} />
        <Stat label="Vrednost naročil" value={eur(work.customerOrders.value)} hint="brez osnutkov" good />
        <Stat label="Moje dostave" value={String(work.deliveries.count)} hint={`${work.deliveries.forOwn} mojim, ${work.deliveries.forOthers} drugim strankam`} />
        <Stat label="Dostave pred mano" value={String(work.upcoming)} hint="potrjeno ali načrtovano" />
      </div>

      <section className="mb-2">
        <div className="flex items-baseline justify-between mb-2.5 px-0.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">Moje stranke · {work.dormant} od {work.customerCount} brez naročila 60+ dni</h2>
          <Link href="/prodaja/stranke" className="text-[12.5px] font-semibold text-wine shrink-0">Vse stranke →</Link>
        </div>
        {quiet.length === 0 ? (
          <Empty>Še nimaš strank na seznamu. Dodeli jih vodstvo, nove zasebne stranke pa so avtomatsko tvoje.</Empty>
        ) : (
          <Card className="divide-y divide-line">
            {quiet.map((q) => {
              const d = q.lastOrderOn ? daysSince(q.lastOrderOn, today) : null;
              return (
                <Link key={q.id} href="/prodaja/stranke" className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold truncate">{q.name}</p>
                    <p className="text-[12.5px] text-ink-muted mt-0.5">{[q.city, q.lastOrderOn ? `zadnje naročilo ${dayMonth(q.lastOrderOn)}` : "še ni naročil"].filter(Boolean).join(" · ")}</p>
                  </div>
                  {d === null ? <Badge tone="warn">brez naročil</Badge> : d < 0 ? <Badge tone="info">naročeno</Badge> : d > 60 ? <Badge tone="danger">{d} dni</Badge> : d > 30 ? <Badge tone="warn">{d} dni</Badge> : <Badge tone="good">{d} dni</Badge>}
                </Link>
              );
            })}
          </Card>
        )}
      </section>
    </Shell>
  );
}

/* ------------------------------------------------------------------ voznik */

export async function DriverHome({ staff }: { staff: Staff }) {
  const days = await getDeliveryDays({ ahead: 1 });
  const today = deliveryToday();
  const tomorrow = addDays(today, 1);
  const mine = (date: string) => (days.find((d) => d.date === date)?.orders ?? []).filter((o) => !o.cancelled && o.driverId === staff.id);
  const t0 = mine(today);
  const t1 = mine(tomorrow);
  const nobody = (days.find((d) => d.date === today)?.orders ?? []).filter((o) => !o.cancelled && !o.driverId && !o.driverName && !done(o)).length;

  return (
    <Shell staff={staff} subtitle="tvoje dostave">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-2.5 mb-6">
        <Stat label="Danes" value={`${t0.filter(done).length} / ${t0.length}`} hint="dostavljeno" good={t0.length > 0 && t0.every(done)} />
        <Stat label="Jutri" value={String(t1.length)} hint="dostav je zate" />
        <Stat label="Brez voznika danes" value={String(nobody)} hint="lahko jih prevzameš v Dostavi" warn={nobody > 0} />
      </div>
      <Heading>Danes</Heading>
      <DeliveryList orders={t0} empty="Danes ti ni dodeljena nobena dostava." />
      <div className="mt-6">
        <Heading>Jutri · {dayMonth(tomorrow)}</Heading>
        <DeliveryList orders={t1} empty="Jutri ti ni dodeljena nobena dostava." />
      </div>
      <Link href="/dostava" className="inline-block mt-4 text-[12.5px] font-semibold text-wine">Odpri Dostavo →</Link>
    </Shell>
  );
}

/* ------------------------------------------------------------------ pisarna */

export async function OfficeHome({ staff }: { staff: Staff }) {
  const [orders, days] = await Promise.all([getOrders(), getDeliveryDays({ ahead: 1 })]);
  const today = deliveryToday();
  const tomorrow = addDays(today, 1);
  const drafts = orders.filter((o) => o.status === "draft");
  const live = (date: string) => (days.find((d) => d.date === date)?.orders ?? []).filter((o) => !o.cancelled);
  const t0 = live(today);
  const t1 = live(tomorrow);
  const tomorrowDay = days.find((d) => d.date === tomorrow);
  const noDriver = [...t0, ...t1].filter((o) => !o.driverId && !o.driverName).length;

  return (
    <Shell staff={staff} subtitle="kaj čaka pisarno">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-2.5 mb-6">
        <Stat label="Čaka potrditev" value={String(drafts.length)} hint="osnutki naročil" warn={drafts.length > 0} />
        <Stat label="Dostave danes" value={`${t0.filter(done).length} / ${t0.length}`} hint="dostavljeno" />
        <Stat label="Dostave jutri" value={String(t1.length)} hint={tomorrowDay?.confirmedAt ? "dan potrjen, pripravi tisk" : "dan še ni potrjen"} />
        <Stat label="Brez voznika" value={String(noDriver)} hint="danes in jutri" warn={noDriver > 0} />
      </div>
      <Heading>Osnutki za potrditev</Heading>
      {drafts.length === 0 ? (
        <Empty>Nič ne čaka na potrditev.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {drafts.slice(0, 8).map((o) => (
            <Link key={o.id} href="/pisarna" className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold truncate">{o.customerName}</p>
                <p className="text-[12.5px] text-ink-muted mt-0.5 line-clamp-1">{o.reviewNote || o.lineSummary}</p>
              </div>
              <span className="text-[13px] font-bold tabular shrink-0">{eur(o.totalGross)}</span>
              <Badge tone={statusTone.draft}>{statusLabel.draft}</Badge>
            </Link>
          ))}
        </Card>
      )}
      <div className="mt-4 flex gap-4">
        <Link href="/pisarna" className="text-[12.5px] font-semibold text-wine">Vsa naročila →</Link>
        <Link href="/tisk" className="text-[12.5px] font-semibold text-wine">Tisk →</Link>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ degustacije */

export async function EventsHome({ staff }: { staff: Staff }) {
  const supabase = await createClient();
  const today = todayIso();
  // presenter / kitchen point at the tasting people, who may be linked to a staff login
  const { data: people } = await supabase.from("degustacija_person").select("id").eq("staff_id", staff.id);
  const myPeople = new Set(((people ?? []) as { id: string }[]).map((x) => x.id));
  const { data } = await supabase
    .from("group_booking")
    .select("id,group_name,visit_date,arrival_time,people_planned,location,status,presenter_id,kitchen_id,drustvo(name)")
    .in("status", ["tentative", "confirmed"])
    .gte("visit_date", today)
    .lte("visit_date", addDays(today, 30))
    .order("visit_date")
    .order("arrival_time")
    .limit(60);
  type Row = { id: string; group_name: string | null; visit_date: string; arrival_time: string | null; people_planned: number | null; location: string; status: string; presenter_id: string | null; kitchen_id: string | null; drustvo: { name: string } | { name: string }[] | null };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, name: r.group_name ?? (Array.isArray(r.drustvo) ? r.drustvo[0]?.name : r.drustvo?.name) ?? "Skupina", mine: (r.presenter_id !== null && myPeople.has(r.presenter_id)) || (r.kitchen_id !== null && myPeople.has(r.kitchen_id)) }));
  const mine = rows.filter((r) => r.mine);
  const week = rows.filter((r) => r.visit_date <= addDays(today, 6));

  return (
    <Shell staff={staff} subtitle="degustacije">
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <Stat label="Moje degustacije" value={String(mine.length)} hint="v naslednjih 30 dneh" good={mine.length > 0} />
        <Stat label="Ta teden" value={String(week.length)} hint="vseh degustacij" />
      </div>
      <Heading>Naslednje degustacije</Heading>
      {rows.length === 0 ? (
        <Empty>V naslednjih 30 dneh ni načrtovanih degustacij.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {rows.slice(0, 12).map((r) => (
            <Link key={r.id} href="/degustacije/koledar" className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold truncate">{r.name}</p>
                <p className="text-[12.5px] text-ink-muted mt-0.5">
                  {[dayMonth(r.visit_date), r.arrival_time?.slice(0, 5), r.people_planned ? `${r.people_planned} oseb` : null, r.location === "zidanica" ? "zidanica" : "klet"].filter(Boolean).join(" · ")}
                </p>
              </div>
              {r.mine && <Badge tone="wine">Zate</Badge>}
              {r.status === "tentative" && <Badge tone="warn">Nepotrjeno</Badge>}
            </Link>
          ))}
        </Card>
      )}
      <Link href="/degustacije/koledar" className="inline-block mt-4 text-[12.5px] font-semibold text-wine">Koledar →</Link>
    </Shell>
  );
}
