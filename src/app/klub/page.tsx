import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getClubSettings, getRecentVisits } from "@/lib/club";
import { getCurrentStaff } from "@/lib/data";
import { StampDesk } from "./stamp-desk";

export const dynamic = "force-dynamic";

/** The till screen: scan the guest's card, give a stamp or the reward. Every staff member can use it. */
export default async function KlubPage() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return (
      <AppShell title="Klub zvestobe" who="Prijava potrebna" section="klub">
        <Card className="p-7 text-center text-[13.5px] text-ink-muted">Prijavite se.</Card>
      </AppShell>
    );
  }
  const [settings, recent] = await Promise.all([getClubSettings(), getRecentVisits(10, staff.role === "manager" ? undefined : staff.id)]);

  return (
    <AppShell title="Klub zvestobe" subtitle="Žig ob obisku Vinoteke" who={staff.fullName} role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied} section="klub">
      <StampDesk settings={settings} recent={recent} staffName={staff.fullName} isManager={staff.role === "manager"} />
    </AppShell>
  );
}
