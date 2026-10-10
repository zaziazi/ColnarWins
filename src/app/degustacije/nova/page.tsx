import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustvoBasics, getPersons } from "@/lib/drustva/data";
import { todayIso } from "@/lib/sales/dates";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { NewTasting } from "./new-tasting";

export const dynamic = "force-dynamic";

/** Manual entry for ad-hoc reservations. Query: ?datum=YYYY-MM-DD&ura=HH:MM (from the calendar) or ?drustvo=<id>. */
export default async function NewTastingPage({ searchParams }: { searchParams: Promise<{ datum?: string; ura?: string; drustvo?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;

  const q = await searchParams;
  const [persons, drustvo] = await Promise.all([
    getPersons(),
    q.drustvo && /^[0-9a-f-]{36}$/.test(q.drustvo) ? getDrustvoBasics(q.drustvo) : Promise.resolve(null),
  ]);

  return (
    <AppShell title="Nova degustacija" subtitle="Ročni vnos rezervacije" who={staff.fullName} role={staff.role} section="degustacije">
      <NewTasting
        persons={persons}
        initial={{
          visitDate: q.datum && /^\d{4}-\d{2}-\d{2}$/.test(q.datum) ? q.datum : todayIso(),
          startTime: q.ura && /^\d{2}:\d{2}$/.test(q.ura) ? q.ura : "",
          drustvoId: drustvo?.id ?? null,
          groupName: drustvo?.name ?? "",
          contactName: drustvo?.contactName ?? "",
          contactPhone: drustvo?.phone ?? "",
          contactEmail: drustvo?.email ?? "",
        }}
      />
    </AppShell>
  );
}
