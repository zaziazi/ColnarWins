import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { eur } from "@/lib/format";
import { dayMonth, todayIso } from "@/lib/sales/dates";
import { getRepOrders, resolveRep, type RepOrder } from "@/lib/sales/work";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Who = "all" | "mine" | "drive";
type Stage = "open" | "done" | "cancelled";

const WHO: { key: Who; label: string }[] = [
  { key: "all", label: "Vse" },
  { key: "mine", label: "Naročila mojih strank" },
  { key: "drive", label: "Dostave, ki jih vozim" },
];
const STAGE: { key: Stage; label: string }[] = [
  { key: "open", label: "V obdelavi" },
  { key: "done", label: "Dostavljeno" },
  { key: "cancelled", label: "Preklicano" },
];

const stageOf = (o: RepOrder): Stage => (o.status === "cancelled" ? "cancelled" : o.status === "delivered" || o.status === "invoiced" ? "done" : "open");

/** Orders of the salesperson's customers and the ones he drives. Status only, no payments. */
export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ w?: string; s?: string; p?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) {
    return (
      <AppShell title="Moja naročila" who="Prijava potrebna" section="dashboard">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Ta stran je na voljo samo prodaji in vodstvu.</p>
        </Card>
      </AppShell>
    );
  }

  const q = await searchParams;
  const who: Who = q.w === "mine" ? "mine" : q.w === "drive" ? "drive" : "all";
  const stage: Stage = q.s === "done" ? "done" : q.s === "cancelled" ? "cancelled" : "open";
  const supabase = await createClient();
  const { repId, repName, reps } = await resolveRep(supabase, staff, q.p);
  const isManager = staff.role === "manager";

  const all = await getRepOrders(supabase, repId, todayIso());
  const counts = (s: Stage) => all.filter((o) => stageOf(o) === s).length;
  const shown = all
    .filter((o) => stageOf(o) === stage)
    .filter((o) => (who === "mine" ? o.mineCustomer : who === "drive" ? o.drives : true));
  if (stage === "done") shown.reverse(); // newest delivery first

  const href = (patch: { w?: Who; s?: Stage; p?: string }) => {
    const w = patch.w ?? who;
    const s = patch.s ?? stage;
    return `/prodaja/narocila?w=${w}&s=${s}${isManager ? `&p=${patch.p ?? repId}` : ""}`;
  };

  return (
    <AppShell
      title="Moja naročila"
      subtitle={isManager ? repName : "Naročila tvojih strank in dostave, ki jih voziš"}
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="dashboard"
      wide
    >
      {isManager && reps.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {reps.map((r) => (
            <Link key={r.id} href={href({ p: r.id })} className={cn("h-9 px-3 rounded-full text-[13px] font-semibold border inline-flex items-center", r.id === repId ? "border-wine text-wine" : "border-line text-ink-muted")}>
              {r.full_name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        {STAGE.map((x) => (
          <Link key={x.key} href={href({ s: x.key })} className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1.5", stage === x.key ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}>
            {x.label} <span className="opacity-70">{counts(x.key)}</span>
          </Link>
        ))}
        <Link href="/pisarna/novo" className="ml-auto h-9 px-3.5 rounded-full text-[13px] font-semibold bg-wine text-white inline-flex items-center gap-1.5">
          <Plus className="size-4" /> Novo naročilo
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {WHO.map((x) => (
          <Link key={x.key} href={href({ w: x.key })} className={cn("h-8 px-3 rounded-full text-[12.5px] font-semibold border inline-flex items-center", who === x.key ? "border-wine text-wine" : "border-line text-ink-muted")}>
            {x.label}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Ni naročil v tem pogledu.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2.5">
          {shown.map((o) => (
            <Card key={o.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] truncate">{o.customerName}</p>
                  <p className="text-[11.5px] text-ink-subtle mt-0.5">
                    {[`#${o.orderNumber}`, o.city, o.deliveryDate ? `dostava ${dayMonth(o.deliveryDate)}` : "brez datuma"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge>
              </div>
              <p className="text-[12.5px] text-ink-muted mt-2 line-clamp-2">{o.lineSummary}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {o.mineCustomer && <Badge tone="wine">Moja stranka</Badge>}
                  {o.drives && <Badge tone="info">Vozim jaz</Badge>}
                  {!o.drives && o.driverName && <span className="text-[11.5px] text-ink-subtle">vozi {o.driverName}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13.5px] font-bold tabular">{eur(o.totalGross)}</span>
                  {o.canEdit && !isManager && (
                    <Link href={`/pisarna/${o.id}/uredi`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-wine">
                      <Pencil className="size-3.5" /> Uredi
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
