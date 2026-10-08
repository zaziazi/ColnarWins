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
      "id,name,kind,lat,lng,address,city,post_code,website,opening_hours,phone,email,contact_name,note,osm_type,osm_id,osm_tags,ignored,prospect_id,customer_id,match_status,match_score,match_distance_m,suggested_customer_id,suggested_score,suggested_distance_m",
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
    osmUrl: `https://www.openstreetmap.org/${v.osm_type}/${v.osm_id}`,
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

export async function setVenueIgnored(venueId: string, ignored: boolean): Promise<ActionResult> {
  if (!Id.safeParse(venueId).success) return { ok: false, error: "Neveljaven lokal." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("venue").update({ ignored }).eq("id", venueId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
