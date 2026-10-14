import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getDeliveryDays, todayIso } from "@/lib/delivery-days";
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

  if (staff.role === "sales") redirect("/dostava");

  const days = await getDeliveryDays();

  return (
    <AppShell
      title="Tisk"
      subtitle="Potrjeni dnevi dostave"
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="narocila"
    >
      <PrintPanel days={days} today={todayIso()} mailTo={printMailTo()} />
    </AppShell>
  );
}
