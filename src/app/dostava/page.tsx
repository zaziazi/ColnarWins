import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getDeliveryDays, todayIso } from "@/lib/delivery-days";
import { printMailTo } from "@/lib/print-mail";
import { DayChips, PrintMine } from "./day-preview";
import { DeliveryList } from "./delivery-list";
import { PushToggle } from "./push-toggle";

export const dynamic = "force-dynamic";

export default async function DostavaPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <AppShell title="Dostava" who="Prijava potrebna" section="narocila">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Prijavi se, da vidiš dostavo.</p>
        </Card>
      </AppShell>
    );
  }

  const today = todayIso();
  const q = await searchParams;
  // any day with deliveries can be opened and ticked off: a forgotten day from last week, or tomorrow's run done a day early
  const days = await getDeliveryDays({ ahead: 8, behind: 14 });
  const selected = q.d && /^\d{4}-\d{2}-\d{2}$/.test(q.d) && days.some((d) => d.date === q.d) ? q.d : today;
  const day = days.find((d) => d.date === selected) ?? null;

  return (
    <AppShell
      title="Dostava"
      subtitle={selected === today ? "Današnja dostava" : selected < today ? "Dostava za nazaj" : "Dostava vnaprej"}
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="narocila"
    >
      <PushToggle />
      <DayChips days={days} selected={selected} today={today} meId={staff.id} />
      <PrintMine day={selected} to={printMailTo()} />
      <DeliveryList day={day} date={selected} today={today} canEdit={staff.role !== "sales"} meId={staff.id} />
    </AppShell>
  );
}
