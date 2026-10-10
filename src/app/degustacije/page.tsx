import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustva, getOpenReplyTasks, getOpenWebReservations, getPersons, getTastingWines } from "@/lib/drustva/data";
import { canUseDrustva } from "./constants";
import { NoAccess } from "./gate";
import { ReplyInbox } from "./reply-inbox";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;

  const [tasks, web, drustva, persons, wines] = await Promise.all([
    getOpenReplyTasks(),
    getOpenWebReservations(),
    getDrustva(),
    getPersons(),
    getTastingWines(),
  ]);

  return (
    <AppShell title="Odgovori" subtitle="Vse, kar čaka na odgovor" who={staff.fullName} role={staff.role} section="degustacije">
      <ReplyInbox
        tasks={tasks}
        web={web}
        drustva={drustva.map((d) => ({ id: d.id, name: d.name, town: d.town }))}
        persons={persons}
        wineOptions={wines}
      />
    </AppShell>
  );
}
