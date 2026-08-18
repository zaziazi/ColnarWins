import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getLotEvents, getProducts, getVessels, getWineLot } from "@/lib/data";
import { LotActions, LotName, StageSelector } from "../../lot-actions";
import { LotHistory } from "../../lot-history";

export const dynamic = "force-dynamic";

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

export default async function WineLotDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [lot, events, vessels, products] = await Promise.all([
    getWineLot(id),
    getLotEvents(id),
    getVessels(),
    getProducts(),
  ]);

  if (!lot) {
    return (
      <AppShell title="Klet" who={`${staff.fullName} · vodstvo`} role={staff.role} section="klet">
        <BackLink />
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Vino ne obstaja.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={lot.lotNumber}
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
      section="klet"
    >
      <BackLink />

      <div className="mb-4">
        <LotName lot={lot} />
        <p className="text-[13px] text-ink-muted mt-1">
          {lot.vesselName ?? "brez rezervoarja"} · {lot.volumeL.toLocaleString("sl-SI")} l
          {lot.status !== "active" && ` · ${lot.status === "bottled" ? "ustekleničeno" : "zlito"}`}
        </p>
        <div className="mt-2.5">
          <StageSelector lot={lot} />
        </div>
      </div>

      {lot.status === "active" && (
        <div className="mb-6">
          <LotActions lot={lot} vessels={vessels} products={products} />
        </div>
      )}

      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
        Zgodovina
      </h2>
      <Card className="mb-2.5">
        <LotHistory events={events} />
      </Card>
    </AppShell>
  );
}
