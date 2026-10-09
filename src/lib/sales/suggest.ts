import { fold } from "@/app/prodaja/constants";
import { plural } from "@/lib/format";
import type { SalesMapPoint, VenueKind } from "@/lib/types";

/**
 * Who is worth visiting first, from what we know today. Deliberately simple
 * and explainable — it is a starting point until visit outcomes show what
 * actually converts. Every point gets a score and the reasons behind it.
 */
const KIND_WEIGHT: Record<VenueKind, number> = {
  restaurant: 3,
  hotel: 3,
  wine_shop: 3,
  pub: 2,
  bar: 2,
  guest_house: 2,
  cafe: 1,
  catering: 1,
  camping: 1,
  fast_food: 0,
  other: 0,
};

function metres(a: SalesMapPoint, b: SalesMapPoint): number {
  const p = Math.PI / 180;
  const x = (b.lng - a.lng) * p * Math.cos(((a.lat + b.lat) / 2) * p);
  const y = (b.lat - a.lat) * p;
  return 6371000 * Math.hypot(x, y);
}

export interface Suggestion {
  score: number;
  reasons: string[];
}

export function suggest(points: SalesMapPoint[]): Map<string, Suggestion> {
  const clients = points.filter((p) => p.status === "client");
  const out = new Map<string, Suggestion>();
  for (const p of points) {
    const reasons: string[] = [];
    let score = KIND_WEIGHT[p.kind] ?? 0;
    if (p.status === "client") {
      reasons.push("naša stranka");
      score += 1;
    } else {
      const near = clients.filter((c) => c.id !== p.id && Math.abs(c.lat - p.lat) < 0.02 && metres(p, c) <= 2000).length;
      if (near > 0) {
        score += Math.min(near, 3) * 0.7;
        reasons.push(`${plural(near, "stranka", "stranki", "stranke", "strank")} v bližini`);
      }
      if (p.status === "prospect") {
        score += 1.5;
        reasons.push("potencialna stranka");
      }
    }
    if (p.phone) {
      score += 1;
      reasons.push("ima telefon");
    }
    if (p.needsReview) score -= 2;
    out.set(`${p.source}:${p.id}`, { score, reasons });
  }
  return out;
}

export interface TownSummary {
  key: string;
  name: string;
  total: number;
  clients: number;
  open: number;
}

/** "NOVO MESTO" (as customers are stored) -> "Novo mesto". */
function tidy(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function towns(points: SalesMapPoint[]): TownSummary[] {
  const by = new Map<string, TownSummary & { names: Map<string, number> }>();
  for (const p of points) {
    if (!p.city) continue;
    const key = fold(p.city.trim());
    let t = by.get(key);
    if (!t) by.set(key, (t = { key, name: p.city.trim(), total: 0, clients: 0, open: 0, names: new Map() }));
    t.total++;
    if (p.status === "client") t.clients++;
    else t.open++;
    t.names.set(p.city.trim(), (t.names.get(p.city.trim()) ?? 0) + 1);
  }
  return [...by.values()]
    .map((t) => ({
      key: t.key,
      name: tidy([...t.names.entries()].sort((a, b) => b[1] - a[1])[0][0]),
      total: t.total,
      clients: t.clients,
      open: t.open,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "sl"));
}

/** Nearest-neighbour order, starting from the first stop. Good enough for a day of 5–10 stops. */
export function routeOrder<T extends { lat: number | null; lng: number | null }>(stops: T[]): T[] {
  const withPos = stops.filter((s) => s.lat !== null && s.lng !== null);
  const without = stops.filter((s) => s.lat === null || s.lng === null);
  if (withPos.length < 3) return stops;
  const rest = [...withPos];
  const route = [rest.shift()!];
  while (rest.length) {
    const last = route[route.length - 1];
    let best = 0;
    let bestD = Infinity;
    rest.forEach((s, i) => {
      const d = Math.hypot((s.lat! - last.lat!) * 111, (s.lng! - last.lng!) * 77);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    route.push(rest.splice(best, 1)[0]);
  }
  return [...route, ...without];
}
