"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { CustomerPointDetail, VenueDetail, VenueKind } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Id = z.string().min(1);

function refresh() {
  revalidatePath("/prodaja");
  revalidatePath("/prodaja/seznam");
}

// ------------------------------------------------------------------- reading

export async function getVenueDetail(venueId: string): Promise<VenueDetail | null> {
  if (isDemoMode || !Id.safeParse(venueId).success) return null;
  const supabase = await createClient();

  const { data: v } = await supabase
    .from("venue")
    .select(
      "id,name,kind,lat,lng,address,city,post_code,website,opening_hours,phone,email,contact_name,note,osm_type,osm_id,osm_tags,ignored,prospect_id,source,location_status,legal_name,vat_id,representative,revenue_eur,employees,customer_id,match_status,match_score,match_distance_m,suggested_customer_id,suggested_score,suggested_distance_m",
    )
    .eq("id", venueId)
    .maybeSingle();
  if (!v) return null;

  const ids = [v.customer_id, v.suggested_customer_id].filter(Boolean) as string[];
  const customers = new Map<string, { id: string; name: string; address: string | null; city: string | null }>();
  if (ids.length > 0) {
    const { data } = await supabase.from("customer").select("id,name,address,city").in("id", ids);
    for (const c of data ?? []) customers.set(c.id, c);
  }

  const linked = v.customer_id ? customers.get(v.customer_id) : undefined;
  const sugg = v.customer_id ? undefined : v.suggested_customer_id ? customers.get(v.suggested_customer_id) : undefined;

  return {
    id: v.id,
    name: v.name,
    kind: v.kind as VenueKind,
    lat: v.lat,
    lng: v.lng,
    address: v.address,
    city: v.city,
    postCode: v.post_code,
    website: v.website,
    openingHours: v.opening_hours,
    phone: v.phone,
    email: v.email,
    contactName: v.contact_name,
    note: v.note,
    cuisine: (v.osm_tags as { cuisine?: string } | null)?.cuisine?.replace(/[;_]/g, ", ") ?? null,
    source: v.source,
    locationStatus: v.location_status,
    legalName: v.legal_name,
    vatId: v.vat_id,
    representative: v.representative,
    revenueEur: v.revenue_eur == null ? null : Number(v.revenue_eur),
    employees: v.employees,
    ignored: v.ignored,
    prospectId: v.prospect_id,
    customer: linked ?? null,
    matchStatus: v.match_status,
    matchScore: v.match_score == null ? null : Number(v.match_score),
    matchDistanceM: v.match_distance_m == null ? null : Number(v.match_distance_m),
    suggested: sugg
      ? {
          ...sugg,
          score: v.suggested_score == null ? null : Number(v.suggested_score),
          distanceM: v.suggested_distance_m == null ? null : Number(v.suggested_distance_m),
        }
      : null,
    osmUrl: v.osm_type ? `https://www.openstreetmap.org/${v.osm_type}/${v.osm_id}` : null,
  };
}

export async function getCustomerPointDetail(customerId: string): Promise<CustomerPointDetail | null> {
  if (isDemoMode || !Id.safeParse(customerId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer")
    .select("id,name,address,city,phone,email")
    .eq("id", customerId)
    .maybeSingle();
  return data ?? null;
}

/** Light list for the "link to a customer" picker. */
export async function listCustomersForLink(): Promise<{ id: string; name: string; city: string | null }[]> {
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("customer").select("id,name,city").eq("active", true).order("name");
  return data ?? [];
}

// ------------------------------------------------------------------- writing

const ContactInput = z.object({
  venueId: Id,
  phone: z.string().trim().max(60),
  email: z.union([z.literal(""), z.string().trim().email()]),
  contactName: z.string().trim().max(120),
  note: z.string().trim().max(1000),
});

export async function updateVenueContact(input: z.infer<typeof ContactInput>): Promise<ActionResult> {
  const parsed = ContactInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Preveri e-naslov in dolžino besedila." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("venue")
    .update({
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      contact_name: parsed.data.contactName || null,
      note: parsed.data.note || null,
    })
    .eq("id", parsed.data.venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Accept the link the system proposed (or confirm an automatic one). */
export async function confirmMatch(venueId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("venue")
    .select("customer_id,suggested_customer_id,suggested_score,suggested_distance_m")
    .eq("id", venueId)
    .single();
  if (!v) return { ok: false, error: "Lokal ne obstaja." };

  const update = v.customer_id
    ? { match_status: "confirmed" }
    : v.suggested_customer_id
      ? {
          customer_id: v.suggested_customer_id,
          match_status: "confirmed",
          match_score: v.suggested_score,
          match_distance_m: v.suggested_distance_m,
          suggested_customer_id: null,
          suggested_score: null,
          suggested_distance_m: null,
        }
      : null;
  if (!update) return { ok: false, error: "Ni predloga za potrditev." };

  const { error } = await supabase.from("venue").update(update).eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** "This is not the same business": remember it so it is never proposed again. */
export async function rejectMatch(venueId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("venue")
    .select("customer_id,suggested_customer_id,rejected_customer_ids")
    .eq("id", venueId)
    .single();
  if (!v) return { ok: false, error: "Lokal ne obstaja." };

  const rejected = new Set<string>(v.rejected_customer_ids ?? []);
  if (v.customer_id) rejected.add(v.customer_id);
  if (v.suggested_customer_id) rejected.add(v.suggested_customer_id);

  const { error } = await supabase
    .from("venue")
    .update({
      customer_id: null,
      match_status: null,
      match_score: null,
      match_distance_m: null,
      suggested_customer_id: null,
      suggested_score: null,
      suggested_distance_m: null,
      rejected_customer_ids: [...rejected],
    })
    .eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function linkVenueToCustomer(venueId: string, customerId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success || !Id.safeParse(customerId).success) {
    return { ok: false, error: "Neveljavni podatki." };
  }
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("venue")
    .update({
      customer_id: customerId,
      match_status: "confirmed",
      match_score: null,
      match_distance_m: null,
      suggested_customer_id: null,
      suggested_score: null,
      suggested_distance_m: null,
    })
    .eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function markProspect(venueId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const staff = await getCurrentStaff();
  const { data: v } = await supabase
    .from("venue")
    .select("name,city,phone,email,contact_name,prospect_id,customer_id")
    .eq("id", venueId)
    .single();
  if (!v) return { ok: false, error: "Lokal ne obstaja." };
  if (v.prospect_id) return { ok: false, error: "Je že označen kot potencialna stranka." };
  if (v.customer_id) return { ok: false, error: "To je že naša stranka." };

  const { data: prospect, error: pError } = await supabase
    .from("prospect")
    .insert({
      name: v.name,
      city: v.city,
      phone: v.phone,
      email: v.email,
      contact_name: v.contact_name,
      sales_rep_id: staff?.id ?? null,
    })
    .select("id")
    .single();
  if (pError || !prospect) return { ok: false, error: pError?.message ?? "Ni uspelo." };

  const { error } = await supabase.from("venue").update({ prospect_id: prospect.id }).eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function unmarkProspect(venueId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { data: v } = await supabase.from("venue").select("prospect_id").eq("id", venueId).single();
  if (!v?.prospect_id) return { ok: true };

  // The venue link clears itself (on delete set null); only an untouched prospect is removed.
  const { error } = await supabase.from("prospect").delete().eq("id", v.prospect_id).eq("stage", "contacted");
  if (error) return { ok: false, error: error.message };
  await supabase.from("venue").update({ prospect_id: null }).eq("id", venueId);
  refresh();
  return { ok: true };
}

/** The sales person checked the pin: this venue really is where the map shows it. */
export async function confirmLocation(venueId: string): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("venue").update({ location_status: "ok" }).eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setVenueIgnored(venueId: string, ignored: boolean): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("venue").update({ ignored }).eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------ add a venue

const KINDS = [
  "restaurant", "bar", "pub", "cafe", "fast_food", "hotel", "guest_house", "wine_shop", "catering", "camping",
] as const;

const CreateVenueInput = z.object({
  name: z.string().trim().min(2, "Vpiši ime lokala.").max(160),
  kind: z.enum(KINDS),
  address: z.string().trim().max(200).default(""),
  city: z.string().trim().max(100).default(""),
  postCode: z.string().trim().max(10).default(""),
  phone: z.string().trim().max(60).default(""),
  email: z.union([z.literal(""), z.string().trim().email("E-naslov ni veljaven.")]).default(""),
  contactName: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  lat: z.number().min(44).max(47.5).nullable().default(null),
  lng: z.number().min(13).max(17).nullable().default(null),
  /** Create even if a similar venue is already nearby. */
  force: z.boolean().default(false),
});

export type CreateVenueResult =
  | { ok: true; id: string; name: string; lat: number; lng: number }
  | { ok: false; error: string; code?: "geocode_failed" | "duplicate"; duplicate?: { id: string; name: string } };

const DOLENJSKA_BOX = { s: 45.55, w: 14.7, n: 46.15, e: 15.55 };

/** Lower-case, accent-free word set without generic words, for a rough "same place?" test. */
function nameTokens(name: string): Set<string> {
  const stop = new Set(["d", "o", "s", "p", "doo", "gostilna", "gostisce", "restavracija", "pizzerija", "bar", "kavarna", "cafe", "caffe", "pub", "hotel", "in", "pri"]);
  return new Set(
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stop.has(t)),
  );
}

function similarNames(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.size === 0 || y.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / Math.min(x.size, y.size) >= 0.6;
}

async function geocodeAddress(q: string): Promise<{ lat: number; lng: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "si" });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

/**
 * Adds a restaurant/bar by hand. The position comes from the address (looked
 * up on OpenStreetMap) or from a pin the user placed on the map. A similar
 * venue within ~100 m is reported first, so the same place isn't added twice.
 */
export async function createVenue(input: z.input<typeof CreateVenueInput>): Promise<CreateVenueResult> {
  const parsed = CreateVenueInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavni podatki." };
  const d = parsed.data;
  if (isDemoMode) return { ok: false, error: "V demo načinu ni mogoče dodajati." };

  let lat = d.lat;
  let lng = d.lng;
  if (lat == null || lng == null) {
    if (!d.address && !d.city) return { ok: false, error: "Vpiši naslov ali kraj, ali postavi lokal na zemljevid." };
    const q = [d.address, [d.postCode, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const found = await geocodeAddress(q);
    if (!found) {
      return { ok: false, code: "geocode_failed", error: "Naslova nisem našel. Preveri ga ali postavi lokal na zemljevid." };
    }
    ({ lat, lng } = found);
  }

  const supabase = await createClient();

  if (!d.force) {
    const { data: near } = await supabase
      .from("venue")
      .select("id,name")
      .gte("lat", lat - 0.0009)
      .lte("lat", lat + 0.0009)
      .gte("lng", lng - 0.0013)
      .lte("lng", lng + 0.0013);
    const dup = (near ?? []).find((v) => similarNames(v.name, d.name));
    if (dup) {
      return { ok: false, code: "duplicate", duplicate: dup, error: `Podoben lokal že obstaja: ${dup.name}.` };
    }
  }

  const staff = await getCurrentStaff();
  const inBox = lat >= DOLENJSKA_BOX.s && lat <= DOLENJSKA_BOX.n && lng >= DOLENJSKA_BOX.w && lng <= DOLENJSKA_BOX.e;

  const { data, error } = await supabase
    .from("venue")
    .insert({
      source: "manual",
      name: d.name,
      kind: d.kind,
      lat,
      lng,
      address: d.address || null,
      city: d.city || null,
      post_code: d.postCode || null,
      phone: d.phone || null,
      email: d.email || null,
      contact_name: d.contactName || null,
      note: d.note || null,
      region: inBox ? "dolenjska" : "ostalo",
      created_by: staff?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Dodajanje ni uspelo." };

  refresh();
  return { ok: true, id: data.id, name: d.name, lat, lng };
}
