import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { getCurrentStaff, getSalesMap } from "@/lib/data";
import { getCarStock, getDayLabels, getPlannedVisits, getSalesProducts } from "@/lib/sales/data";
import { todayIso } from "@/lib/sales/dates";
import { NoAccess } from "../gate";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) return <NoAccess />;

  const today = todayIso();
  const [visits, labels, carStock, products, points] = await Promise.all([
    getPlannedVisits(staff.id, today, today),
    getDayLabels(staff.id, today, today),
    getCarStock(),
    getSalesProducts(),
    getSalesMap(),
  ]);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <AppShell title="Na terenu" subtitle="Obiski za danes" who={staff.fullName} role={staff.role} section="prodaja">
      <TodayView
        today={today}
        label={labels[today] ?? ""}
        visits={visits}
        carStock={carStock}
        products={products}
        points={points}
        origin={origin}
        repName={staff.fullName}
      />
    </AppShell>
  );
}
