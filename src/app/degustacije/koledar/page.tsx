import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getBookingsBetween, getDrustvaSettings, getPersons } from "@/lib/drustva/data";
import { addDays, monthStart, todayIso, weekDays, weekStart } from "@/lib/sales/dates";
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
  const month = q.v === "month";
  // month view: the whole grid from the Monday before the 1st, six weeks
  const start = weekStart(month ? monthStart(anchor) : anchor);
  const span = month ? 41 : 6;

  const [bookings, settings, persons] = await Promise.all([
    getBookingsBetween(start, addDays(start, span)),
    getDrustvaSettings(),
    getPersons(),
  ]);

  return (
    <AppShell title="Koledar" subtitle="Degustacije po dnevih in urah" who={staff.fullName} role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied} section="degustacije">
      <Calendar
        today={today}
        anchor={anchor}
        days={month ? Array.from({ length: 42 }, (_, i) => addDays(start, i)) : weekDays(start)}
        bookings={bookings}
        persons={persons}
        hostingWeekdays={settings.hostingWeekdays}
        blackoutDates={settings.blackoutDates}
        initialView={q.v === "week" ? "week" : q.v === "day" ? "day" : month ? "month" : null}
      />
    </AppShell>
  );
}
