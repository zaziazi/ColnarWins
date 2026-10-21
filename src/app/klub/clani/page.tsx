import { AppShell } from "@/components/app-shell";
import { getClubSettings, getMembers } from "@/lib/club";
import { requireClubManager } from "../gate";
import { MemberList } from "./member-list";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const gate = await requireClubManager();
  if ("denied" in gate) return gate.denied;
  const { staff } = gate;
  const [settings, members] = await Promise.all([getClubSettings(), getMembers()]);

  return (
    <AppShell title="Člani kluba" subtitle={`${members.length} članov`} who={staff.fullName} role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied} section="klub" wide>
      <MemberList members={members} stampsNeeded={settings.stampsNeeded} />
    </AppShell>
  );
}
