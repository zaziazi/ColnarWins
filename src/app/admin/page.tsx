import { AppShell } from "@/components/app-shell";
import { getStaffMembers } from "@/lib/admin-data";
import { getCurrentStaff } from "@/lib/data";
import { NoAccess } from "./gate";
import { StaffRoles } from "./staff-roles";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager") return <NoAccess />;
  const members = await getStaffMembers();

  return (
    <AppShell title="Uporabniki in vloge" subtitle="Kdo lahko kaj vidi in dela" who={staff.fullName} role={staff.role} section="admin">
      <StaffRoles members={members} meId={staff.id} />
    </AppShell>
  );
}
