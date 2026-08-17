import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export default function DeliveryPage() {
  return (
    <AppShell title="Dostava" subtitle="Pogled na voznikovem telefonu">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">
          Še ni zgrajeno. Največji tehnični del — podpis, GPS in delo brez signala.
        </p>
        <p className="text-[11.5px] text-ink-subtle mt-3">Glej specifikacijo, §7.4.</p>
      </Card>
    </AppShell>
  );
}
