import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const staff = await getCurrentStaff();

  return (
    <AppShell title="Dostava" subtitle="Pogled na voznikovem telefonu" role={staff?.role} section="narocila">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">
          Še ni zgrajeno. Največji tehnični del — podpis, GPS in delo brez signala.
        </p>
        <p className="text-[11.5px] text-ink-subtle mt-3">Glej specifikacijo, §7.4.</p>
      </Card>
    </AppShell>
  );
}
