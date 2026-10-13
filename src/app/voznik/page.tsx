import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { getCurrentStaff, getRouteForDriver } from "@/lib/data";
import { PushToggle } from "@/app/dostava/push-toggle";
import { RouteShell } from "./route-shell";

export const dynamic = "force-dynamic";


/** Local-noon anchor avoids a UTC-rollover off-by-one — same technique nextDeliveryDates uses. */
function todayIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default async function DostavaPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <AppShell title="Voznik" who="Prijava potrebna" section="narocilaAc">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Prijavi se, da vidiš svojo pot.</p>
        </Card>
      </AppShell>
    );
  }

  if (!staff.seesAc) redirect("/pisarna");

  const date = todayIso();
  const routes = await getRouteForDriver(date, staff.id);

  return (
    <AppShell
      title="Voznik"
      subtitle="Tvoja pot za danes (s podpisom)"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin}
      section="narocilaAc"
    >
      <PushToggle />
      <RouteShell initialRoutes={routes} date={date} />
    </AppShell>
  );
}
