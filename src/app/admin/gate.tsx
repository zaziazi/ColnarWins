import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export function NoAccess() {
  return (
    <AppShell title="Admin" who="Prijava potrebna" section="admin">
      <Card className="p-7 text-center">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">Ta stran je na voljo samo vodstvu.</p>
      </Card>
    </AppShell>
  );
}
