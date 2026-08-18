import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getVessels } from "@/lib/data";
import { NewVesselForm } from "../new-vessel-form";
import { VesselSummaryCard } from "../vessel-summary-card";
import type { Vessel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VesselsPage() {
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

  const vessels = await getVessels();
  const stainless = vessels.filter((v) => v.material === "stainless");
  const wood = vessels.filter((v) => v.material === "wood");

  return (
    <AppShell
      title="Rezervoarji"
      subtitle="Inox in leseni sodi"
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="klet"
    >
      <div className="flex justify-end mb-4">
        <NewVesselForm />
      </div>

      {vessels.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-ink-muted">Še ni rezervoarjev.</p>
        </Card>
      ) : (
        <>
          <VesselGroup label="Inox cisterne" vessels={stainless} />
          <VesselGroup label="Leseni sodi" vessels={wood} />
        </>
      )}
    </AppShell>
  );
}

function VesselGroup({ label, vessels }: { label: string; vessels: Vessel[] }) {
  if (vessels.length === 0) return null;

  return (
    <>
      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{label}</h2>
      <div className="space-y-2.5 mb-6">
        {vessels.map((vessel) => (
          <VesselSummaryCard key={vessel.id} vessel={vessel} />
        ))}
      </div>
    </>
  );
}
