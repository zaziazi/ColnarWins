import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getActiveLots, getCurrentStaff } from "@/lib/data";
import { ImportShell } from "./import-shell";

export const dynamic = "force-dynamic";

export default async function ImportReadingsPage() {
  const staff = await getCurrentStaff();

  if (!staff || staff.role !== "manager") {
    return (
      <AppShell title="Klet" who="Marija · pisarna" section="klet">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const lots = await getActiveLots();

  return (
    <AppShell
      title="Uvoz meritev"
      subtitle="Datoteke iz FOSS naprave"
      who={staff.fullName}
      role={staff.role}
      section="klet"
    >
      <ImportShell lots={lots} />
    </AppShell>
  );
}
