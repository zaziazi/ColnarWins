import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getDeliveryDays, todayIso } from "@/lib/delivery-days";
import { DeliveryList } from "./delivery-list";
import { PushToggle } from "./push-toggle";

export const dynamic = "force-dynamic";

export default async function DostavaPage() {
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
  const day = (await getDeliveryDays()).find((d) => d.date === today) ?? null;

  return (
    <AppShell
      title="Dostava"
      subtitle="Današnja dostava"
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      section="narocila"
    >
      <PushToggle />
      <DeliveryList day={day} date={today} />
    </AppShell>
  );
}
