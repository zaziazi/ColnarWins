import type { MapStatus, VenueKind } from "@/lib/types";

export const KIND_LABEL: Record<VenueKind, string> = {
  restaurant: "Restavracija",
  bar: "Bar",
  pub: "Pub",
  cafe: "Kavarna",
  fast_food: "Hitra hrana",
  hotel: "Hotel",
  guest_house: "Prenočišče",
  wine_shop: "Vinoteka",
  other: "Stranka (drugo)",
};

/** Venue types offered as filters, in the order a wine salesperson cares about. */
export const FILTER_KINDS: VenueKind[] = [
  "restaurant",
  "bar",
  "pub",
  "cafe",
  "hotel",
  "guest_house",
  "wine_shop",
  "fast_food",
];

export const STATUS_LABEL: Record<MapStatus, string> = {
  client: "Naša stranka",
  prospect: "Potencialna stranka",
  open: "Ni stranka",
};

export const STATUS_TONE: Record<MapStatus, "good" | "wine" | "neutral"> = {
  client: "good",
  prospect: "wine",
  open: "neutral",
};

/** Lower-case and strip diacritics, so "kocevje" finds "Kočevje". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
