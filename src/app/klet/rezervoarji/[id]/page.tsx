import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getVessel } from "@/lib/data";
import { VesselEditForm } from "../vessel-edit-form";
import { CATEGORY_LABEL } from "../../vessel-category";

export const dynamic = "force-dynamic";

function BackLink() {
  return (
    <Link
      href="/klet/rezervoarji"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-subtle hover:text-ink mb-4"
    >
      <ChevronLeft className="size-4" /> Rezervoarji
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

  const vessel = await getVessel(id);

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
      subtitle={CATEGORY_LABEL[vessel.category]}
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="klet"
    >
      <BackLink />

      <div className="mb-4">
        <VesselEditForm vessel={vessel} />
        <p className="text-[13px] text-ink-muted mt-1">Kapaciteta {vessel.capacityL.toLocaleString("sl-SI")} l</p>
      </div>

      {vessel.activeLotId ? (
        <Link href={`/klet/vino/${vessel.activeLotId}`}>
          <Card className="p-3.5 flex items-center justify-between gap-3 hover:border-line-strong transition-colors">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-ink-subtle tabular">{vessel.activeLotNumber}</p>
              <h3 className="font-semibold text-[15px] truncate">{vessel.activeLotName}</h3>
              <p className="text-[12px] text-ink-subtle mt-0.5">
                {vessel.activeLotVolumeL?.toLocaleString("sl-SI")} l
              </p>
            </div>
            <ChevronRight className="size-4 text-ink-subtle shrink-0" />
          </Card>
        </Link>
      ) : (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-ink-muted mb-3">Rezervoar je prazen.</p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/klet">
              <Plus /> Sprejem
            </Link>
          </Button>
        </Card>
      )}
    </AppShell>
  );
}
