import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export function NoAccess() {
  return (
    <AppShell title="Društva" who="Prijava potrebna" section="drustva">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">Ta stran je na voljo samo vodstvu in osebi za društva.</p>
      </Card>
    </AppShell>
  );
}
