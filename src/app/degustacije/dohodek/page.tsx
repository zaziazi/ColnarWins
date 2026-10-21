import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { dateShort, eur } from "@/lib/format";
import { canUseFinance } from "@/lib/office";
import { addMonths, monthStart, monthTitle, todayIso } from "@/lib/sales/dates";
import { createClient } from "@/lib/supabase/server";
import { LOCATION_LABEL, PAYMENT_LABEL, type PaymentMethod } from "@/lib/types";
import { NoAccess } from "../gate";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  visit_date: string;
  group_name: string | null;
  location: "klet" | "zidanica";
  status: string;
  people_actual: number | null;
  tasting_fee_eur: number | null;
  wine_sales_eur: number | null;
  other_income_eur: number | null;
  income_payment_method: PaymentMethod | null;
  income_paid_at: string | null;
  drustvo: { name: string } | null;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);
const total = (r: Row) => num(r.tasting_fee_eur) + num(r.wine_sales_eur) + num(r.other_income_eur);

/** What group tastings earned in a month: tasting fee, wine sold, extras, how it was paid and what is still open. */
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager" || !canUseFinance(staff.role, staff.denied)) return <NoAccess />;

  const q = await searchParams;
  const today = todayIso();
  const month = q.m && /^\d{4}-\d{2}$/.test(q.m) ? `${q.m}-01` : monthStart(today);
  const next = addMonths(month, 1);

  const supabase = await createClient();
  const { data } = await supabase
    .from("group_booking")
    .select("id,visit_date,group_name,location,status,people_actual,tasting_fee_eur,wine_sales_eur,other_income_eur,income_payment_method,income_paid_at,drustvo(name)")
    .gte("visit_date", month)
    .lt("visit_date", next)
    .in("status", ["visited", "confirmed"])
    .order("visit_date", { ascending: true });
  const all = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, drustvo: Array.isArray(r.drustvo) ? r.drustvo[0] : r.drustvo }));
  const done = all.filter((r) => r.status === "visited");
  // confirmed tastings in the past that nobody closed yet
  const open = all.filter((r) => r.status === "confirmed" && r.visit_date <= today);

  const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const grand = sum(done, total);
  const unpaid = sum(done.filter((r) => !r.income_paid_at), total);
  const byLocation = (["klet", "zidanica"] as const).map((l) => ({ l, rows: done.filter((r) => r.location === l) }));
  const byMethod = (Object.keys(PAYMENT_LABEL) as PaymentMethod[])
    .map((m) => ({ m, amount: sum(done.filter((r) => r.income_payment_method === m), total) }))
    .filter((x) => x.amount > 0);
  const people = sum(done, (r) => num(r.people_actual));
  const prev = addMonths(month, -1).slice(0, 7);
  const following = next.slice(0, 7);

  return (
    <AppShell
      title="Dohodek degustacij"
      subtitle={monthTitle(month)}
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="degustacije"
      wide
    >
      <div className="flex items-center gap-1.5 mb-4">
        <Button asChild variant="secondary" size="sm" aria-label="Prejšnji mesec">
          <Link href={`/degustacije/dohodek?m=${prev}`}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm" aria-label="Naslednji mesec">
          <Link href={`/degustacije/dohodek?m=${following}`}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/degustacije/dohodek">Ta mesec</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-2.5 mb-5">
        <Stat label="Skupaj" value={eur(grand)} hint={`${done.length} degustacij · ${people} oseb`} />
        {byLocation.map(({ l, rows }) => (
          <Stat key={l} label={LOCATION_LABEL[l]} value={eur(sum(rows, total))} hint={`${rows.length} degustacij`} />
        ))}
        <Stat label="Še ni plačano" value={eur(unpaid)} hint={unpaid > 0 ? "preverite plačilo" : "vse plačano"} warn={unpaid > 0} />
      </div>

      {byMethod.length > 0 && (
        <p className="text-[12.5px] text-ink-muted mb-4">
          Po načinu plačila: {byMethod.map((x) => `${PAYMENT_LABEL[x.m]} ${eur(x.amount)}`).join(" · ")}
        </p>
      )}

      {open.length > 0 && (
        <Card className="p-3.5 mb-4 border-warn/40 bg-warn-soft/30">
          <p className="text-[13px] font-semibold">Čaka na zaključek ({open.length})</p>
          <p className="text-[12px] text-ink-muted mt-0.5">Skupine, ki so že bile, a prihodek še ni vpisan. V koledarju odprite degustacijo, jo označite kot »Obiskali« in vpišite zneske.</p>
          <ul className="mt-2 text-[13px] space-y-0.5">
            {open.map((r) => (
              <li key={r.id}>
                {dateShort(new Date(`${r.visit_date}T12:00:00`))} · {r.group_name ?? r.drustvo?.name ?? "Skupina"} · {LOCATION_LABEL[r.location]}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-subtle bg-surface-muted">
              <th className="px-3 py-2.5">Datum</th>
              <th className="px-3 py-2.5">Skupina</th>
              <th className="px-3 py-2.5">Kje</th>
              <th className="px-3 py-2.5 text-right">Oseb</th>
              <th className="px-3 py-2.5 text-right">Degustacija</th>
              <th className="px-3 py-2.5 text-right">Vino</th>
              <th className="px-3 py-2.5 text-right">Drugo</th>
              <th className="px-3 py-2.5 text-right">Skupaj</th>
              <th className="px-3 py-2.5">Plačilo</th>
            </tr>
          </thead>
          <tbody>
            {done.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2.5 whitespace-nowrap">{dateShort(new Date(`${r.visit_date}T12:00:00`))}</td>
                <td className="px-3 py-2.5 font-medium">{r.group_name ?? r.drustvo?.name ?? "Skupina"}</td>
                <td className="px-3 py-2.5">{r.location === "zidanica" ? <Badge tone="wine">Zidanica</Badge> : "Klet"}</td>
                <td className="px-3 py-2.5 text-right tabular">{r.people_actual ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular">{r.tasting_fee_eur != null ? eur(num(r.tasting_fee_eur)) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular">{r.wine_sales_eur != null ? eur(num(r.wine_sales_eur)) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular">{r.other_income_eur != null ? eur(num(r.other_income_eur)) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular font-semibold">{eur(total(r))}</td>
                <td className="px-3 py-2.5">
                  {r.income_paid_at ? <Badge tone="good">Plačano{r.income_payment_method ? ` · ${PAYMENT_LABEL[r.income_payment_method].split(" ")[0]}` : ""}</Badge> : <Badge tone="warn">Odprto</Badge>}
                </td>
              </tr>
            ))}
            {done.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-ink-muted">
                  Ta mesec še ni zaključenih degustacij.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-card)] border bg-surface p-3.5 ${warn ? "border-warn" : "border-line"}`}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</p>
      <p className="text-[20px] font-bold tabular mt-1">{value}</p>
      {hint && <p className="text-[11.5px] text-ink-subtle mt-0.5">{hint}</p>}
    </div>
  );
}
