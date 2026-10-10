import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustvaSettings, getPersons, getStaffChoices } from "@/lib/drustva/data";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;
  const [settings, people, persons] = await Promise.all([getDrustvaSettings(), getStaffChoices(), getPersons()]);

  return (
    <AppShell title="Nastavitve" subtitle="Osebe, informacijski list, kapaciteta" who={staff.fullName} role={staff.role} section="degustacije">
      <SettingsForm settings={settings} people={people} persons={persons} />
    </AppShell>
  );
}
