import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getActiveLots, getCurrentStaff, getVessels } from "@/lib/data";
import { HarvestIntakeForm } from "./harvest-intake-form";
import { WineLotCard } from "./wine-lot-card";

export const dynamic = "force-dynamic";

export default async function WineLotsPage() {
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

  const [lots, vessels] = await Promise.all([getActiveLots(), getVessels()]);
  const emptyVessels = vessels.filter((v) => !v.activeLotId && v.active);

  return (
    <AppShell
      title="Klet"
      subtitle="Vina v kleti"
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="klet"
    >
      <HarvestIntakeForm emptyVessels={emptyVessels} />

      {lots.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-ink-muted">Trenutno ni aktivnega vina.</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {lots.map((lot) => (
            <WineLotCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
