import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getDrustva, getOpenReplyTasks } from "@/lib/drustva/data";
import { canUseDrustva } from "./constants";
import { NoAccess } from "./gate";
import { ReplyInbox } from "./reply-inbox";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;

  const [tasks, drustva] = await Promise.all([getOpenReplyTasks(), getDrustva()]);

  return (
    <AppShell title="Odgovori" subtitle="Odgovori društev, ki čakajo nate" who={staff.fullName} role={staff.role} section="drustva">
      <ReplyInbox
        tasks={tasks}
        drustva={drustva.map((d) => ({ id: d.id, name: d.name, town: d.town }))}
      />
    </AppShell>
  );
}
