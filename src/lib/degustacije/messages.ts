import type { DegustacijaPerson, GroupBooking } from "@/lib/types";

/** Pure helpers (no server-only): used by the server to send and by the calendar to offer manual links. */

const DOW = ["nedelja", "ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota"];

export function dateSl(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** The instant at which the Ljubljana wall clock shows `date` `time` (handles summer/winter time). */
export function ljubljanaInstant(dateIso: string, time: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Ljubljana", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asUtc - guess));
}

/** +386… (E.164) from the usual Slovenian ways of writing a number; null if it does not look like one. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("0")) s = `+386${s.slice(1)}`;
  if (!s.startsWith("+")) s = `+${s}`;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

function when(b: GroupBooking): string {
  return `${dateSl(b.visitDate)}${b.startTime ? ` ob ${b.startTime}` : ""}${b.endTime ? `–${b.endTime}` : ""}`;
}

/** What the presenter needs to know the day before. */
export function presenterMessage(b: GroupBooking): string {
  const lines = [
    `Degustacija ${when(b)}`,
    `Skupina: ${b.groupName}${b.peoplePlanned ? `, ${b.peoplePlanned} oseb` : ""}`,
    b.winePreferences ? `Želje glede vin: ${b.winePreferences}` : "Vina izberete na licu mesta",
    b.food ? `Hrana: da${b.foodNotes ? ` (${b.foodNotes})` : ""}` : "Hrana: ne",
  ];
  if (b.contactName || b.contactPhone) lines.push(`Kontakt: ${[b.contactName, b.contactPhone].filter(Boolean).join(", ")}`);
  if (b.notes) lines.push(`Opombe: ${b.notes}`);
  return lines.join("\n");
}

/** What the kitchen (bread) needs: when, how many, and the notes. */
export function kitchenMessage(b: GroupBooking): string {
  const lines = [
    `Priprava hrane za degustacijo ${when(b)}`,
    `Skupina: ${b.groupName}${b.peoplePlanned ? `, ${b.peoplePlanned} oseb` : ""}`,
    "Pripravi svež kruh.",
  ];
  if (b.foodNotes) lines.push(`Hrana in posebnosti: ${b.foodNotes}`);
  if (b.notes) lines.push(`Opombe: ${b.notes}`);
  return lines.join("\n");
}

/** Links for sending the same text by hand (when automatic sending is not set up). */
export function manualLink(person: Pick<DegustacijaPerson, "phone" | "channel">, text: string): string | null {
  const phone = normalizePhone(person.phone);
  if (!phone) return null;
  return person.channel === "whatsapp"
    ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(text)}`
    : `sms:${phone}?body=${encodeURIComponent(text)}`;
}
