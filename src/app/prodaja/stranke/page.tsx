import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { dayMonth, todayIso } from "@/lib/sales/dates";
import { getRepCustomers, resolveRep } from "@/lib/sales/work";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PlanButton } from "../plan-button";
import { AddCustomer, RemoveCustomer, type Candidate } from "./owner-editor";

export const dynamic = "force-dynamic";

function daysSince(iso: string, today: string): number {
  return Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${iso}T12:00:00Z`).getTime()) / 86400000);
}

/** The customers that belong to the salesperson, longest without an order first. */
export default async function MyCustomersPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) {
    return (
      <AppShell title="Moje stranke" who="Prijava potrebna" section="prodaja">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Ta stran je na voljo samo prodaji in vodstvu.</p>
        </Card>
      </AppShell>
    );
  }

  const q = await searchParams;
  const supabase = await createClient();
  const today = todayIso();
  const { repId, repName, reps } = await resolveRep(supabase, staff, q.p);
  const isManager = staff.role === "manager";
  const customers = await getRepCustomers(supabase, repId);

  // longest without an order first; never ordered at the very top
  const sorted = [...customers].sort((a, b) => (a.lastOrderOn ?? "").localeCompare(b.lastOrderOn ?? "") || a.name.localeCompare(b.name, "sl"));
  const dormant = customers.filter((c) => !c.lastOrderOn || daysSince(c.lastOrderOn, today) > 60).length;

  let candidates: Candidate[] = [];
  if (isManager) {
    const { data } = await supabase.from("customer").select("id,name,city,sales_rep_id").eq("active", true).order("name").limit(2000);
    const names = new Map(reps.map((r) => [r.id, r.full_name]));
    candidates = ((data ?? []) as { id: string; name: string; city: string | null; sales_rep_id: string | null }[])
      .filter((c) => c.sales_rep_id !== repId)
      .map((c) => ({ id: c.id, name: c.name, city: c.city, repId: c.sales_rep_id, repName: c.sales_rep_id ? (names.get(c.sales_rep_id) ?? "drug prodajalec") : null }));
  }

  return (
    <AppShell
      title="Moje stranke"
      subtitle={isManager ? repName : `${customers.length} strank · ${dormant} brez naročila 60+ dni`}
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="prodaja"
      wide
    >
      {isManager && reps.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {reps.map((r) => (
            <Link key={r.id} href={`/prodaja/stranke?p=${r.id}`} className={cn("h-9 px-3 rounded-full text-[13px] font-semibold border inline-flex items-center", r.id === repId ? "border-wine text-wine" : "border-line text-ink-muted")}>
              {r.full_name}
            </Link>
          ))}
        </div>
      )}

      <p className="text-[12.5px] text-ink-muted mb-4 leading-relaxed">
        Tukaj so stranke, ki jih je pridobil {isManager ? repName : "ti"}. Stranke od prej nimajo prodajalca; njihova naročila lahko vseeno vozi {isManager ? repName : "ti"}, a ne štejejo kot prodaja.
        {isManager ? "" : " Stranke ti dodeli vodstvo; nove stranke, ki jih vneseš sam, so avtomatsko tvoje."}
      </p>

      {isManager && <AddCustomer repId={repId} repName={repName} candidates={candidates} />}

      {sorted.length === 0 ? (
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Še ni strank na tem seznamu.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2.5">
          {sorted.map((c) => {
            const days = c.lastOrderOn ? daysSince(c.lastOrderOn, today) : null;
            return (
              <Card key={c.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] truncate">{c.name}</p>
                    <p className="text-[11.5px] text-ink-subtle mt-0.5">
                      {[c.city, c.lastOrderOn ? `${days !== null && days < 0 ? "dostava" : "zadnje naročilo"} ${dayMonth(c.lastOrderOn)}` : "še ni naročil", c.orders90 > 0 ? `${c.orders90} v 90 dneh` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {days === null ? <Badge tone="warn">brez naročil</Badge> : days < 0 ? <Badge tone="info">naročeno</Badge> : days > 60 ? <Badge tone="danger">{days} dni</Badge> : days > 30 ? <Badge tone="warn">{days} dni</Badge> : <Badge tone="good">{days} dni</Badge>}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.phone && <a href={`tel:${c.phone}`} className="text-[12.5px] font-semibold text-wine">{c.phone}</a>}
                  </div>
                  {isManager && <RemoveCustomer customerId={c.id} name={c.name} />}
                </div>
                {!isManager && <div className="mt-3"><PlanButton target={{ customerId: c.id }} /></div>}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
