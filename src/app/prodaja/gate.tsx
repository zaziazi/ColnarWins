import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export function NoAccess() {
  return (
    <AppShell title="Prodaja" who="Prijava potrebna" section="prodaja">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">Ta stran je na voljo samo prodaji in vodstvu.</p>
      </Card>
    </AppShell>
  );
}
