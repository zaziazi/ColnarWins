import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

interface Row {
  visit_id: string;
  planned_for: string;
  planned_time: string | null;
  sort_order: number;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  outcome: string | null;
  day_label: string | null;
  note: string | null;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 asks for lines of at most 75 octets; fold at 70 characters to stay safe with UTF-8. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 70) {
    out.push(rest.slice(0, 70));
    rest = " " + rest.slice(70);
  }
  out.push(rest);
  return out.join("\r\n");
}

const compact = (iso: string) => iso.replace(/-/g, "");

function addDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The salesperson's plan as a subscribable calendar. Stops with a time become
 * timed events; the rest of a day is summed up in one all-day event whose
 * description lists the stops in order.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{16,64}$/.test(token)) return new Response("Not found", { status: 404 });

  const { data, error } = await createAnonClient().rpc("calendar_feed", { p_token: token });
  if (error) return new Response("Error", { status: 500 });
  const rows = (data ?? []) as Row[];

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Colnix//Teren//SL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Colnix – teren",
    "X-WR-TIMEZONE:Europe/Ljubljana",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const byDay = new Map<string, Row[]>();
  for (const r of rows) byDay.set(r.planned_for, [...(byDay.get(r.planned_for) ?? []), r]);

  for (const [date, stops] of byDay) {
    const label = stops.find((s) => s.day_label)?.day_label;
    const desc = stops
      .map((s, i) => {
        const place = [s.address, s.city].filter(Boolean).join(", ");
        return `${i + 1}. ${s.outcome ? "✓ " : ""}${s.name}${place ? ` – ${place}` : ""}${s.phone ? ` – ${s.phone}` : ""}`;
      })
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:day-${date}@colnix`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(addDay(date))}`,
      `SUMMARY:${esc(`Teren${label ? `: ${label}` : ""} (${stops.length})`)}`,
      `DESCRIPTION:${esc(desc)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
    for (const s of stops) {
      if (!s.planned_time) continue;
      const t = s.planned_time.slice(0, 5).replace(":", "");
      const endH = String((Number(t.slice(0, 2)) + 1) % 24).padStart(2, "0");
      const place = [s.name, s.address, s.city].filter(Boolean).join(", ");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${s.visit_id}@colnix`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Ljubljana:${compact(date)}T${t}00`,
        `DTEND;TZID=Europe/Ljubljana:${compact(date)}T${endH}${t.slice(2)}00`,
        `SUMMARY:${esc(`${s.outcome ? "✓ " : ""}${s.name}`)}`,
        `LOCATION:${esc(place)}`,
        `DESCRIPTION:${esc([s.phone ? `Tel: ${s.phone}` : "", s.note ?? ""].filter(Boolean).join("\n"))}`,
        ...(s.lat !== null && s.lng !== null ? [`GEO:${s.lat};${s.lng}`] : []),
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
      "Content-Disposition": 'inline; filename="colnix-teren.ics"',
    },
  });
}
