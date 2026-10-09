import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { getCurrentStaff, getSalesMap } from "@/lib/data";
import { todayIso, weekDays, weekStart } from "@/lib/sales/dates";
import { getCalendarToken, getDayLabels, getFollowUps, getPlannedVisits } from "@/lib/sales/data";
import { NoAccess } from "../gate";
import { WeekPlanner } from "./week-planner";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) return <NoAccess />;

  const today = todayIso();
  const { t } = await searchParams;
  const anchor = t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : today;
  const start = weekStart(anchor);
  const days = weekDays(start);
  const end = days[6];

  const [visits, labels, followUps, points, token] = await Promise.all([
    getPlannedVisits(staff.id, start, end),
    getDayLabels(staff.id, start, end),
    getFollowUps(staff.id, end),
    getSalesMap(),
    getCalendarToken(staff.id),
  ]);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <AppShell title="Načrt" subtitle="Obiski po dnevih" who={staff.fullName} role={staff.role} section="prodaja">
      <WeekPlanner
        today={today}
        start={start}
        days={days.map((date) => ({
          date,
          label: labels[date] ?? "",
          visits: visits.filter((v) => v.plannedFor === date),
        }))}
        followUps={followUps}
        points={points}
        calendarUrl={token ? `${origin}/api/calendar/${token}.ics` : null}
      />
    </AppShell>
  );
}
