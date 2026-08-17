import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getCustomers, getReceivablesAgeing } from "@/lib/data";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<string, string> = {
  within_terms: "V roku",
  overdue_1_30: "1–30 dni",
  overdue_30_plus: "30+ dni",
};

export default async function FinancePage() {
  const staff = await getCurrentStaff();

  if (!staff || staff.role !== "manager") {
    return (
      <AppShell title="Finance" who="Marija · pisarna" section="finance">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const [ageing, customers] = await Promise.all([getReceivablesAgeing(), getCustomers()]);

  const overdue = customers
    .filter((c) => c.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return (
    <AppShell
      title="Finance"
      subtitle="Terjatve"
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="finance"
    >
      <SectionHeading>Odprte terjatve</SectionHeading>
      <Card className="mb-6">
        {ageing.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni odprtih terjatev.</p>
        ) : (
          ageing.map((b, i) => (
            <div
              key={b.bucket}
              className={cn(
                "flex items-center justify-between px-3.5 py-3",
                i < ageing.length - 1 && "border-b border-line",
              )}
            >
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
        <div className="space-y-2.5">
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
      {children}
    </h2>
  );
}
