import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getCustomers, getReceivablesAgeing } from "@/lib/data";
import { getMoneyOverview } from "@/lib/finance/overview";
import { canUseFinance } from "@/lib/office";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FinanceNoAccess } from "./gate";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<string, string> = {
  within_terms: "V roku",
  overdue_1_30: "1–30 dni",
  overdue_30_plus: "30+ dni",
};

const d = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("sl-SI", { day: "numeric", month: "numeric" });

export default async function FinancePage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseFinance(staff.role, staff.denied)) return <FinanceNoAccess />;

  const [ageing, customers, o] = await Promise.all([getReceivablesAgeing(), getCustomers(), getMoneyOverview()]);
  const overdue = customers.filter((c) => c.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const maxWeek = Math.max(1, ...o.weeks.flatMap((w) => [w.inAmount, w.outAmount]), o.overdueIn, o.overdueOut);

  return (
    <AppShell
      title="Finance"
      subtitle="Pregled denarja"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="finance"
      wide
    >
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-2.5 mb-6">
        <Stat label="Odprte terjatve" value={eur(o.receivablesTotal)} hint={o.receivablesOverdue > 0 ? `od tega zapadlo ${eur(o.receivablesOverdue)}` : "nič ni zapadlo"} href="/finance/racuni" />
        <Stat label="Računi za potrditev" value={String(o.billsToApprove.count)} hint={eur(o.billsToApprove.amount)} href="/finance/dobavitelji" tone={o.billsToApprove.count > 0 ? "warn" : undefined} />
        <Stat label="Potrjeno za plačilo" value={eur(o.billsToPay.amount)} hint={`${o.billsToPay.count} računov`} href="/finance/dobavitelji" />
        <Stat label="Plačila za potrditev" value={String(o.suggestedPayments + o.unmatchedPayments)} hint={`${o.suggestedPayments} predlogov, ${o.unmatchedPayments} brez para`} href="/finance/placila" tone={o.suggestedPayments + o.unmatchedPayments > 0 ? "warn" : undefined} />
      </div>

      <SectionHeading>Prihodnji štirje tedni</SectionHeading>
      <Card className="mb-6 p-3.5">
        <div className="space-y-3">
          <Week label="Že zapadlo" sub="še ni plačano" inAmount={o.overdueIn} outAmount={o.overdueOut} max={maxWeek} />
          {o.weeks.map((w) => (
            <Week key={w.from} label={w.label} sub={`${d(w.from)} – ${d(w.to)}`} inAmount={w.inAmount} outAmount={w.outAmount} max={maxWeek} />
          ))}
        </div>
        <p className="text-[11.5px] text-ink-subtle mt-3">
          Prejemki so odprti računi kupcev po roku plačila, odhodki so računi dobaviteljev, ki še niso plačani. Napoved je ocena, ne knjigovodstvo.
        </p>
      </Card>

      <SectionHeading>Odprte terjatve</SectionHeading>
      <Card className="mb-6">
        {ageing.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni odprtih terjatev.</p>
        ) : (
          ageing.map((b, i) => (
            <div key={b.bucket} className={cn("flex items-center justify-between px-3.5 py-3", i < ageing.length - 1 && "border-b border-line")}>
              <span className="text-[13.5px] font-medium">{BUCKET_LABEL[b.bucket] ?? b.bucket}</span>
              <span className="text-right">
                <span className="block text-[13.5px] font-semibold tabular">{eur(b.amount)}</span>
                <span className="block text-[11px] text-ink-subtle">{b.invoiceCount} računov</span>
              </span>
            </div>
          ))
        )}
      </Card>

      <SectionHeading>Kupci v zamudi</SectionHeading>
      {overdue.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-ink-muted">Noben kupec ni v zamudi.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2.5">
          {overdue.map((c) => (
            <Card key={c.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[15px] truncate">{c.name}</h3>
                  <p className="text-[11.5px] text-ink-subtle mt-0.5">{c.city}</p>
                </div>
                <Badge tone={c.daysOverdue > 30 ? "danger" : "warn"}>{c.daysOverdue} dni</Badge>
              </div>
              <p className="text-[13px] font-semibold tabular mt-2">{eur(c.openBalance)}</p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint, href, tone }: { label: string; value: string; hint?: string; href: string; tone?: "warn" }) {
  return (
    <Link href={href} className={cn("block rounded-[var(--radius-card)] border bg-surface p-3.5 hover:bg-surface-muted transition-colors", tone === "warn" ? "border-warn" : "border-line")}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</p>
      <p className="text-[20px] font-bold tabular mt-1">{value}</p>
      {hint && <p className="text-[11.5px] text-ink-subtle mt-0.5">{hint}</p>}
    </Link>
  );
}

function Week({ label, sub, inAmount, outAmount, max }: { label: string; sub: string; inAmount: number; outAmount: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] font-semibold">{label}</span>
        <span className="text-[11.5px] text-ink-subtle">{sub}</span>
      </div>
      <Bar color="bg-good" amount={inAmount} max={max} prefix="+" />
      <Bar color="bg-wine" amount={outAmount} max={max} prefix="−" />
    </div>
  );
}

function Bar({ color, amount, max, prefix }: { color: string; amount: number; max: number; prefix: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2.5 rounded-full bg-surface-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(amount > 0 ? 2 : 0, (amount / max) * 100)}%` }} />
      </div>
      <span className="w-[92px] text-right text-[12.5px] font-semibold tabular">{amount > 0 ? `${prefix} ${eur(amount)}` : "—"}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{children}</h2>;
}
