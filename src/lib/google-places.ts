import "server-only";

/**
 * Google Places API (New) lookups for the venue sheet.
 *
 * Terms: only the place_id may be stored; ratings, review counts and prices
 * are fetched live each time and never written to our database. The key lives
 * in GOOGLE_PLACES_API_KEY (server only — never sent to the browser).
 *
 * Cost control: every paid call is counted in `api_usage`; once
 * GOOGLE_PLACES_MONTHLY_CAP calls (default 900, just under Google's 1,000
 * free calls per month for this tier) are used, lookups stop until next month.
 */

export interface GooglePlaceInfo {
  placeId: string;
  name: string;
  rating: number | null;
  ratingCount: number | null;
  /** 0 (free) – 4 (very expensive); null when Google has no price level. */
  priceLevel: number | null;
  closed: "permanently" | "temporarily" | null;
  mapsUrl: string | null;
}

export type GoogleLookup =
  | { status: "ok"; info: GooglePlaceInfo }
  | { status: "unconfigured" | "notfound" | "limit" | "error"; message?: string };

const FIELDS = "id,displayName,rating,userRatingCount,priceLevel,businessStatus,googleMapsUri,location";
const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export function monthlyCap(): number {
  const n = Number(process.env.GOOGLE_PLACES_MONTHLY_CAP);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
}

export function toInfo(p: RawPlace): GooglePlaceInfo {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    priceLevel: p.priceLevel && p.priceLevel in PRICE ? PRICE[p.priceLevel] : null,
    closed:
      p.businessStatus === "CLOSED_PERMANENTLY" ? "permanently" : p.businessStatus === "CLOSED_TEMPORARILY" ? "temporarily" : null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const STOP = new Set(["gostilna", "gostisce", "restavracija", "pizzerija", "pizzeria", "picerija", "bar", "kavarna", "pub", "hotel", "in", "pri", "d", "o", "s", "p"]);
const tokens = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)));

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const p = Math.PI / 180;
  return 6371000 * Math.hypot((bLng - aLng) * p * Math.cos(((aLat + bLat) / 2) * p), (bLat - aLat) * p);
}

/** Picks the result that is plausibly the same place: close by, and sharing a word of the name. */
export function bestMatch(places: RawPlace[], venue: { name: string; lat: number; lng: number }): RawPlace | null {
  const want = tokens(venue.name);
  let best: { p: RawPlace; score: number } | null = null;
  for (const p of places) {
    if (!p.location) continue;
    const d = metres(venue.lat, venue.lng, p.location.latitude, p.location.longitude);
    const have = tokens(p.displayName?.text ?? "");
    const shared = [...want].some((t) => have.has(t));
    if (d > 400 || (!shared && d > 60)) continue;
    const score = (shared ? 1000 : 0) - d;
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

export async function lookupGooglePlace(
  venue: { name: string; city: string | null; lat: number; lng: number; googlePlaceId: string | null },
  /** Counts one paid call; false means the monthly cap is used up. */
  allowCall: () => Promise<boolean>,
  /** Remember the place_id so the next lookup can skip the search. */
  savePlaceId: (placeId: string) => Promise<void>,
): Promise<GoogleLookup> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { status: "unconfigured" };

  try {
    let raw: RawPlace | null = null;

    if (venue.googlePlaceId) {
      if (!(await allowCall())) return { status: "limit" };
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(venue.googlePlaceId)}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
        cache: "no-store",
      });
      if (res.ok) raw = (await res.json()) as RawPlace;
      else if (res.status !== 404) return { status: "error", message: `Google: ${res.status}` };
    }

    if (!raw) {
      if (!(await allowCall())) return { status: "limit" };
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELDS.split(",").map((f) => `places.${f}`).join(","),
        },
        body: JSON.stringify({
          textQuery: [venue.name, venue.city].filter(Boolean).join(", "),
          languageCode: "sl",
          maxResultCount: 5,
          locationBias: { circle: { center: { latitude: venue.lat, longitude: venue.lng }, radius: 500 } },
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { status: "error", message: `Google: ${res.status} ${body.slice(0, 160)}` };
      }
      const json = (await res.json()) as { places?: RawPlace[] };
      raw = bestMatch(json.places ?? [], venue);
      if (!raw) return { status: "notfound" };
      await savePlaceId(raw.id);
    }

    return { status: "ok", info: toInfo(raw) };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message.slice(0, 160) : "napaka" };
  }
}
