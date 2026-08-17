import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getProducts, getVessel, getVesselReadings } from "@/lib/data";
import { VesselCard } from "../vessel-card";
import type { VesselMaterial } from "@/lib/types";

export const dynamic = "force-dynamic";

const MATERIAL_LABEL: Record<VesselMaterial, string> = {
  stainless: "Inox cisterna",
  wood: "Leseni sod",
};

function BackLink() {
  return (
    <Link
      href="/klet"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-subtle hover:text-ink mb-4"
    >
      <ChevronLeft className="size-4" /> Klet
    </Link>
  );
}

export default async function VesselDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const [vessel, readings, products] = await Promise.all([
    getVessel(id),
    getVesselReadings(id),
    getProducts(),
  ]);

  if (!vessel) {
    return (
      <AppShell title="Klet" who={`${staff.fullName} · vodstvo`} role={staff.role} section="klet">
        <BackLink />
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Rezervoar ne obstaja.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={vessel.name}
      subtitle={MATERIAL_LABEL[vessel.material]}
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="klet"
    >
      <BackLink />
      <VesselCard vessel={vessel} products={products} readings={readings} />
    </AppShell>
  );
}
