import Link from "next/link";
import { AlertTriangle, ChevronRight, ShoppingBasket, Truck, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getBrief, type BriefItem } from "@/lib/brief";
import { getCurrentStaff, getMonthlyOrderTotals } from "@/lib/data";
import { dateSl, eur, narocila } from "@/lib/format";
import { RefreshBrief } from "./refresh-brief";
import { DriverHome, EventsHome, OfficeHome, SalesHome } from "./role-homes";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<BriefItem["kind"], string> = {
  draft: "Osnutek",
  drustvo: "Društvo",
  web: "Spletna rezervacija",
  nodriver: "Dostava",
  unconfirmed: "Dostava",
  inbox: "Pošta",
  bill: "Račun dobavitelja",
  payment: "Plačila",
};

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 11 ? "Dobro jutro" : h < 18 ? "Dober dan" : "Dober večer";
}

export default async function DashboardPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <AppShell title="Pregled" who="Prijava potrebna" section="dashboard">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Prijavi se, da vidiš svoj pregled.</p>
        </Card>
      </AppShell>
    );
  }

  // everyone has their own Pregled; management keeps the full dashboard below
  if (staff.role === "sales") return <SalesHome staff={staff} />;
  if (staff.role === "driver") return <DriverHome staff={staff} />;
  if (staff.role === "office") return <OfficeHome staff={staff} />;
  if (staff.role === "events") return <EventsHome staff={staff} />;

  const [brief, monthly] = await Promise.all([getBrief({ showOffice: staff.isAdmin }), getMonthlyOrderTotals()]);
  const n = brief.numbers;
  const date = dateSl(new Date(`${brief.today}T12:00:00`));

  return (
    <AppShell
      title={`${greeting()}, ${staff.fullName}`}
      subtitle={`${date} · kaj te čaka danes`}
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      isAdmin={staff.isAdmin}
      denied={staff.denied}
      section="dashboard"
      wide
    >
      <Card className="p-4 min-[900px]:p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-wine">
            Jutranji povzetek {brief.summary.ai ? "· napisal AI iz podatkov Colnixa" : "· iz podatkov Colnixa"}
          </p>
          <RefreshBrief />
        </div>
        <p className="text-[15px] leading-relaxed max-w-[72ch]">{brief.summary.text}</p>
      </Card>

      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-6">
        <Stat label="Čaka na odločitev" value={String(n.needs)} sub="osnutki, odgovori, dostava" tone={n.needs > 0 ? "wine" : undefined} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Nova naročila danes" value={String(n.newOrders)} sub={`ta mesec ${narocila(monthly.count)}, ${eur(monthly.totalGross)}`} icon={<ShoppingBasket className="size-4" />} />
        <Stat
          label="Kupci v zamudi"
          value={eur(n.overdueAmount)}
          sub={`${n.overdueCount} ${n.overdueCount === 1 ? "račun" : "računov"}`}
          tone={n.overdueAmount > 0 ? "danger" : undefined}
          icon={<Wallet className="size-4" />}
        />
        <Stat label="Dostave danes" value={n.deliveriesTotal ? `${n.deliveriesDone} / ${n.deliveriesTotal}` : "0"} sub="dostavljeno" icon={<Truck className="size-4" />} />
      </div>

      <div className="grid min-[900px]:grid-cols-[1.4fr_1fr] gap-6">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Čaka na odločitev</h2>
          {brief.items.length === 0 ? (
            <Card className="p-5 text-center">
              <p className="text-[13px] text-ink-muted">Nič ne čaka.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-line">
              {brief.items.map((it, i) => (
                <Link key={i} href={it.href} className="flex items-center gap-3 p-3.5 hover:bg-surface-muted transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold truncate">{it.title}</p>
                    <p className="text-[12.5px] text-ink-muted mt-0.5 line-clamp-2">{it.detail}</p>
                  </div>
                  <Badge tone="neutral">{KIND_LABEL[it.kind]}</Badge>
                  <ChevronRight className="size-4 text-ink-subtle shrink-0" />
                </Link>
              ))}
            </Card>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Današnje dostave</h2>
            {brief.deliveries.length === 0 ? (
              <Card className="p-5 text-center">
                <p className="text-[13px] text-ink-muted">Danes ni potrjenih dostav.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-line">
                {brief.deliveries.map((d) => (
                  <Link key={d.driver} href="/dostava" className="flex items-center justify-between gap-3 p-3.5 hover:bg-surface-muted transition-colors">
                    <span className="text-[14.5px] font-semibold">{d.driver}</span>
                    <Badge tone={d.done === d.total ? "good" : "warn"}>
                      {d.done} / {d.total}
                    </Badge>
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Nočna opravila</h2>
            <Card className="divide-y divide-line">
              {brief.jobs.length === 0 ? (
                <p className="p-4 text-[13px] text-ink-muted">Še ni zapisa. Opravila tečejo ob 07:00, 07:30, 16:00 in 17:00.</p>
              ) : (
                brief.jobs.map((j) => (
                  <div key={j.name} className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-[13.5px]">{j.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11.5px] text-ink-subtle">
                        {j.at ? new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(j.at)) : ""}
                      </span>
                      <Badge tone={j.ok === false ? "danger" : "good"}>{j.ok === false ? "Napaka" : "V redu"}</Badge>
                    </span>
                  </div>
                ))
              )}
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "wine" | "danger";
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-3.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-subtle">
        {icon} {label}
      </p>
      <p className={`mt-1.5 text-[26px] leading-none font-bold tabular tracking-[-0.02em] ${tone === "wine" ? "text-wine" : tone === "danger" ? "text-danger" : ""}`}>
        {value}
      </p>
      <p className="text-[12px] text-ink-muted mt-1.5">{sub}</p>
    </Card>
  );
}
