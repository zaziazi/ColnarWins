import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import type { CurrentStaff } from "@/lib/types";

/** Pregled, Člani and Sporočila are for managers; everyone else only stamps. */
export async function requireClubManager(): Promise<{ staff: CurrentStaff } | { denied: React.ReactNode }> {
  const staff = await getCurrentStaff();
  if (staff?.role === "manager") return { staff };
  return {
    denied: (
      <AppShell title="Klub zvestobe" who={staff?.fullName ?? "Prijava potrebna"} role={staff?.role} section="klub">
        <Card className="p-7 text-center text-[13.5px] text-ink-muted">Ta stran je na voljo samo vodstvu.</Card>
      </AppShell>
    ),
  };
}
