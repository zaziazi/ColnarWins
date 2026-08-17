import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export default function SalesPage() {
  return (
    <AppShell title="Komerciala" subtitle="Obiski, vzorci, novi kupci">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">
          Še ni zgrajeno. Predlagani obiski potrebujejo tri mesece zgodovine naročil, da so smiselni.
        </p>
        <p className="text-[11.5px] text-ink-subtle mt-3">Glej specifikacijo, §7.6.</p>
      </Card>
    </AppShell>
  );
}
