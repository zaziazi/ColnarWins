import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getVessels } from "@/lib/data";
import { NewVesselForm } from "../new-vessel-form";
import { VesselGroup } from "../vessel-group";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "../vessel-category";

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

  return (
    <AppShell
      title="Rezervoarji"
      subtitle="Cisterne, inox in sodi"
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
        CATEGORY_ORDER.map((category) => (
          <VesselGroup
            key={category}
            label={CATEGORY_LABEL[category]}
            vessels={vessels.filter((v) => v.category === category)}
          />
        ))
      )}
    </AppShell>
  );
}
