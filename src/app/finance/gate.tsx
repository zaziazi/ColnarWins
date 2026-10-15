import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export function FinanceNoAccess() {
  return (
    <AppShell title="Finance" who="Prijava potrebna" section="finance">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">Ta stran še ni na voljo.</p>
      </Card>
    </AppShell>
  );
}
