/** Date helpers for the weekly plan. ISO strings (YYYY-MM-DD) everywhere; Ljubljana wall clock. */

const TZ = "Europe/Ljubljana";

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(iso, -dow);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAY = new Intl.DateTimeFormat("sl-SI", { weekday: "long", timeZone: "UTC" });
const DAYMONTH = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "long", timeZone: "UTC" });

export function weekdayName(iso: string): string {
  const s = WEEKDAY.format(new Date(`${iso}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayMonth(iso: string): string {
  return DAYMONTH.format(new Date(`${iso}T12:00:00Z`));
}

/** Next working day (Mon–Fri) strictly after `iso`. */
export function nextWorkday(iso: string): string {
  let d = addDays(iso, 1);
  for (;;) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
}
