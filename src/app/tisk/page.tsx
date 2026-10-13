import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getSimpleRoutes, todayIso } from "@/lib/simple-routes";
import { printMailTo } from "@/lib/print-mail";
import { PrintPanel } from "./print-panel";

export const dynamic = "force-dynamic";

export default async function TiskPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    return (
      <AppShell title="Tisk" who="Prijava potrebna" section="narocila">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Prijavi se, da vidiš naročila za tisk.</p>
        </Card>
      </AppShell>
    );
  }

  const routes = await getSimpleRoutes();

  return (
    <AppShell
      title="Tisk"
      subtitle="Potrjeni načrti voznika"
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      section="narocila"
    >
      <PrintPanel routes={routes} today={todayIso()} mailTo={printMailTo()} />
    </AppShell>
  );
}
