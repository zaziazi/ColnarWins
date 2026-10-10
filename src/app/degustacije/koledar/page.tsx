import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getBookingsBetween, getDrustvaSettings, getPersons } from "@/lib/drustva/data";
import { addDays, todayIso, weekDays, weekStart } from "@/lib/sales/dates";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { Calendar } from "./calendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ d?: string; v?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;

  const today = todayIso();
  const q = await searchParams;
  const anchor = q.d && /^\d{4}-\d{2}-\d{2}$/.test(q.d) ? q.d : today;
  const start = weekStart(anchor);

  const [bookings, settings, persons] = await Promise.all([
    getBookingsBetween(start, addDays(start, 6)),
    getDrustvaSettings(),
    getPersons(),
  ]);

  return (
    <AppShell title="Koledar" subtitle="Degustacije po dnevih in urah" who={staff.fullName} role={staff.role} section="degustacije">
      <Calendar
        today={today}
        anchor={anchor}
        days={weekDays(start)}
        bookings={bookings}
        persons={persons}
        hostingWeekdays={settings.hostingWeekdays}
        blackoutDates={settings.blackoutDates}
        initialView={q.v === "week" ? "week" : q.v === "day" ? "day" : null}
      />
    </AppShell>
  );
}
