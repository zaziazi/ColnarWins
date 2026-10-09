import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getSalesMap } from "@/lib/data";
import { SalesExplorer } from "./explorer";

export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const staff = await getCurrentStaff();

  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) {
    return (
      <AppShell title="Prodaja" who="Prijava potrebna" section="prodaja">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo prodaji in vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const points = await getSalesMap();

  return (
    <AppShell
      title="Prodaja"
      subtitle="Lokali in naše stranke"
      who={staff.fullName}
      role={staff.role}
      section="prodaja"
    >
      <SalesExplorer points={points} initialView={v === "list" ? "list" : "map"} />
    </AppShell>
  );
}
