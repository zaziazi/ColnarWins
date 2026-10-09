import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustvaSettings, getStaffChoices } from "@/lib/drustva/data";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;
  const [settings, people] = await Promise.all([getDrustvaSettings(), getStaffChoices()]);

  return (
    <AppShell title="Nastavitve" subtitle="Informacijski list, pravila, kapaciteta" who={staff.fullName} role={staff.role} section="drustva">
      <SettingsForm settings={settings} people={people} />
    </AppShell>
  );
}
