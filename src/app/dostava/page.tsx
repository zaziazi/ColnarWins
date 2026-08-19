import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getRouteForDriver } from "@/lib/data";
import { RouteShell } from "./route-shell";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  office: "pisarna",
  driver: "voznik",
  sales: "prodaja",
  manager: "vodstvo",
};

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
      <AppShell title="Dostava" who="Prijava potrebna" section="narocila">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Prijavi se, da vidiš svojo pot.</p>
        </Card>
      </AppShell>
    );
  }

  const date = todayIso();
  const routes = await getRouteForDriver(date, staff.id);

  return (
    <AppShell
      title="Dostava"
      subtitle="Tvoja pot za danes"
      who={`${staff.fullName} · ${ROLE_LABEL[staff.role] ?? staff.role}`}
      role={staff.role}
      section="narocila"
    >
      <RouteShell initialRoutes={routes} date={date} />
    </AppShell>
  );
}
