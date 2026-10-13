import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getSimpleRoutes, todayIso } from "@/lib/simple-routes";
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

  const routes = await getSimpleRoutes();

  return (
    <AppShell
      title="Dostava"
      subtitle="Naročila na poti"
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      section="narocila"
    >
      <PushToggle />
      <DeliveryList routes={routes} today={todayIso()} />
    </AppShell>
  );
}
