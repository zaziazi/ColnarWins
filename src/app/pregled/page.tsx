import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getMonthlyOrderTotals } from "@/lib/data";
import { eur, narocila } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const staff = await getCurrentStaff();

  if (!staff || staff.role !== "manager") {
    return (
      <AppShell title="Pregled" who="Marija · pisarna" section="dashboard">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const monthly = await getMonthlyOrderTotals();

  return (
    <AppShell
      title="Pregled"
      subtitle="Splošni pregled"
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="dashboard"
    >
      <SectionHeading>Naročila ta mesec</SectionHeading>
      <Card className="p-3.5 mb-6">
        <p className="text-2xl font-bold tabular">{eur(monthly.totalGross)}</p>
        <p className="text-[12.5px] text-ink-subtle mt-0.5">{narocila(monthly.count)}</p>
      </Card>
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
