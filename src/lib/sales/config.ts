/** Wording and branding of the messages the salesperson sends. Change here, nowhere else. */

export const SALES_BRAND = "Vinarna Colnar";

/** The "I'm coming" text. Neutral wording — works whoever sends it. */
export function announceSms(opts: { repName: string; offerUrl: string }): string {
  return (
    `Pozdravljeni! Sem ${opts.repName} iz ${SALES_BRAND}. Danes sem v vaši okolici in se z veseljem oglasim – ` +
    `ob kateri uri vam ustreza? Naša ponudba vin: ${opts.offerUrl}`
  );
}

/** `sms:` links differ between iOS and Android on how the body is separated. */
export function smsHref(phone: string, body: string): string {
  const num = phone.replace(/[^\d+]/g, "");
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `sms:${num}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

export function navigateHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export interface RouteStop {
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string | null;
}

const stopPoint = (s: RouteStop): string | null =>
  s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : [s.name, s.address, s.city].filter(Boolean).join(", ") || null;

/**
 * Google Maps directions through all the stops, in the given order. Starts at
 * the phone's current position (no origin). Maps takes at most 10 points per
 * link, so a longer day is split into consecutive links that pick up where
 * the previous one ended.
 */
export function routeLinks(stops: RouteStop[]): { href: string; from: number; to: number }[] {
  const points = stops.map(stopPoint).filter((p): p is string => Boolean(p));
  const MAX = 10;
  const links: { href: string; from: number; to: number }[] = [];
  for (let start = 0; start < points.length; start += MAX) {
    const chunk = points.slice(start, start + MAX);
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(0, -1);
    const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
    if (start > 0) params.set("origin", points[start - 1]);
    if (waypoints.length) params.set("waypoints", waypoints.join("|"));
    links.push({ href: `https://www.google.com/maps/dir/?${params.toString()}`, from: start + 1, to: start + chunk.length });
  }
  return links;
}
