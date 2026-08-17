import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export default function PlanPage() {
  return (
    <AppShell title="Načrt dostave" subtitle="Poti in nakladalni listi">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">
          Še ni zgrajeno. Pride v 6. tednu — večerna naloga sestavi jutrišnji poti in nakladalna lista.
        </p>
        <p className="text-[11.5px] text-ink-subtle mt-3">Glej specifikacijo, §7.3.</p>
      </Card>
    </AppShell>
  );
}
