import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getCarStock, getRepMovements } from "@/lib/sales/data";
import { NoAccess } from "../gate";
import { CarStock } from "./car-stock";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) return <NoAccess />;

  const [stock, movements] = await Promise.all([getCarStock(), getRepMovements(staff.id)]);

  return (
    <AppShell title="Vino v avtu" subtitle="Vzorci za na pot" who={staff.fullName} role={staff.role} section="prodaja">
      <CarStock stock={stock} movements={movements} />
    </AppShell>
  );
}
