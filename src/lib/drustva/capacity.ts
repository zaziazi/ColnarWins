import type { DrustvaSettings, GroupBooking } from "@/lib/types";

const dow = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Hosting days (not blacked out, below the daily maximum) after `today`.
 * The AI may only offer dates from this list, so any date in a draft is real.
 */
export function freeDates(
  today: string,
  settings: Pick<DrustvaSettings, "hostingWeekdays" | "blackoutDates" | "maxGroupsPerDay">,
  bookings: Pick<GroupBooking, "visitDate" | "status">[],
  days = 56,
): string[] {
  const used = new Map<string, number>();
  for (const b of bookings) if (b.status !== "cancelled") used.set(b.visitDate, (used.get(b.visitDate) ?? 0) + 1);
  const out: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, i);
    if (settings.hostingWeekdays.includes(dow(d)) && !settings.blackoutDates.includes(d) && (used.get(d) ?? 0) < settings.maxGroupsPerDay) out.push(d);
  }
  return out;
}
