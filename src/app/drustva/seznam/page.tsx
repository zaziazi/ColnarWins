import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustva } from "@/lib/drustva/data";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { DrustvaList } from "./drustva-list";

export const dynamic = "force-dynamic";

export default async function DrustvaPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;
  const drustva = await getDrustva();

  return (
    <AppShell title="Društva" subtitle={`${drustva.length} društev na seznamu`} who={staff.fullName} role={staff.role} section="drustva">
      <DrustvaList drustva={drustva} />
    </AppShell>
  );
}
