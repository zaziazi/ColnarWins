"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CompleteResult = { ok: true; orderId?: string } | { ok: false; error: string; visitSaved?: boolean };

const Id = z.string().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function refresh() {
  revalidatePath("/prodaja/teden");
  revalidatePath("/prodaja/danes");
  revalidatePath("/prodaja/zaloga");
  revalidatePath("/pisarna");
}

async function me() {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "sales" && staff.role !== "manager")) return null;
  return staff;
}

// ------------------------------------------------------------------- planning

const PlanInput = z.object({
  date: IsoDate,
  targets: z
    .array(z.object({ venueId: Id.optional(), customerId: Id.optional() }).refine((t) => t.venueId || t.customerId))
    .min(1)
    .max(60),
});

/** Adds venues/customers to a day; ones already planned that day are skipped. */
export async function planVisits(input: z.infer<typeof PlanInput>): Promise<ActionResult & { added?: number }> {
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true, added: 0 };
  const staff = await me();
  if (!staff) return { ok: false, error: "Prijava potrebna." };

  const supabase = await createClient();
  const { date, targets } = parsed.data;

  const { data: existing } = await supabase
    .from("visit")
    .select("venue_id,customer_id,sort_order")
    .eq("staff_id", staff.id)
    .eq("planned_for", date)
    .is("visited_at", null);
  const taken = new Set((existing ?? []).map((e) => e.venue_id ?? e.customer_id));
  let order = Math.max(-1, ...(existing ?? []).map((e) => e.sort_order as number)) + 1;

  const venueIds = targets.map((t) => t.venueId).filter(Boolean) as string[];
  const venues = new Map<string, { customer_id: string | null; prospect_id: string | null }>();
  if (venueIds.length) {
    const { data } = await supabase.from("venue").select("id,customer_id,prospect_id").in("id", venueIds);
    for (const v of data ?? []) venues.set(v.id, v);
  }

  const rows = [];
  for (const t of targets) {
    const key = t.venueId ?? t.customerId!;
    if (taken.has(key)) continue;
    taken.add(key);
    const v = t.venueId ? venues.get(t.venueId) : undefined;
    rows.push({
      staff_id: staff.id,
      planned_for: date,
      venue_id: t.venueId ?? null,
      customer_id: t.customerId ?? v?.customer_id ?? null,
      prospect_id: v?.prospect_id ?? null,
      sort_order: order++,
      reason: "obisk",
    });
  }
  if (rows.length === 0) return { ok: true, added: 0 };

  const { error } = await supabase.from("visit").insert(rows);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, added: rows.length };
}

export async function removeVisit(visitId: string): Promise<ActionResult> {
  if (!Id.safeParse(visitId).success) return { ok: false, error: "Neveljaven obisk." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("visit").delete().eq("id", visitId).is("visited_at", null);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** `orderedIds` is the new top-to-bottom order of that day's open visits. */
export async function reorderVisits(orderedIds: string[]): Promise<ActionResult> {
  if (!z.array(Id).max(80).safeParse(orderedIds).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("visit").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true };
}

export async function moveVisitToDay(visitId: string, date: string): Promise<ActionResult> {
  if (!Id.safeParse(visitId).success || !IsoDate.safeParse(date).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("visit")
    .update({ planned_for: date, sort_order: 99 })
    .eq("id", visitId)
    .is("visited_at", null);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Ta lokal je ta dan že na seznamu." : error.message };
  }
  refresh();
  return { ok: true };
}

export async function setVisitTime(visitId: string, time: string | null): Promise<ActionResult> {
  if (!Id.safeParse(visitId).success) return { ok: false, error: "Neveljaven obisk." };
  if (time !== null && !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Neveljavna ura." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("visit").update({ planned_time: time }).eq("id", visitId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setDayLabel(date: string, label: string): Promise<ActionResult> {
  if (!IsoDate.safeParse(date).success) return { ok: false, error: "Neveljaven datum." };
  if (isDemoMode) return { ok: true };
  const staff = await me();
  if (!staff) return { ok: false, error: "Prijava potrebna." };
  const supabase = await createClient();
  const text = label.trim().slice(0, 80);
  const { error } = text
    ? await supabase.from("day_plan").upsert({ staff_id: staff.id, plan_date: date, label: text })
    : await supabase.from("day_plan").delete().eq("staff_id", staff.id).eq("plan_date", date);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Logged when the salesperson taps "SMS" — we cannot see whether the text was actually sent. */
export async function markAnnounced(visitId: string, via: "sms" | "call" | "whatsapp"): Promise<ActionResult> {
  if (!Id.safeParse(visitId).success) return { ok: false, error: "Neveljaven obisk." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("visit")
    .update({ announced_at: new Date().toISOString(), announced_via: via })
    .eq("id", visitId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/prodaja/danes");
  return { ok: true };
}

// ------------------------------------------------------------------- the visit

const Lines = z.array(z.object({ productId: Id, quantity: z.number().int().positive().max(5000) })).max(40);

const CustomerInput = z.object({
  name: z.string().max(200).optional().default(""),
  vatId: z.string().max(20).optional().default(""),
  address: z.string().max(200).optional().default(""),
  city: z.string().max(100).optional().default(""),
  postCode: z.string().max(10).optional().default(""),
  contactName: z.string().max(120).optional().default(""),
  phone: z.string().max(40).optional().default(""),
  email: z.string().max(200).optional().default(""),
});

const OrderPart = z.object({
  deliveryDate: IsoDate,
  note: z.string().max(500).optional().default(""),
  lines: Lines.min(1),
  customer: CustomerInput.optional(),
});

const CompleteInput = z.object({
  visitId: Id,
  outcome: z.enum(["ordered", "thinking", "no_interest", "not_there"]),
  contact: z.string().max(120).optional().default(""),
  note: z.string().max(1000).optional().default(""),
  followUp: IsoDate.nullable().optional(),
  samples: Lines.optional().default([]),
  gps: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  order: OrderPart.nullable().optional(),
});

function orderRpcArgs(visitId: string, o: z.infer<typeof OrderPart>) {
  return {
    p_visit_id: visitId,
    p_delivery_date: o.deliveryDate,
    p_lines: o.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    p_customer: o.customer
      ? {
          name: o.customer.name,
          vat_id: o.customer.vatId,
          address: o.customer.address,
          city: o.customer.city,
          post_code: o.customer.postCode,
          contact_name: o.customer.contactName,
          phone: o.customer.phone,
          email: o.customer.email,
        }
      : null,
    p_note: o.note || null,
  };
}

/** Records the visit (outcome, contact, samples out of the car) and, if an order was taken, creates the draft order. */
export async function completeVisit(input: z.infer<typeof CompleteInput>): Promise<CompleteResult> {
  const parsed = CompleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Obisk ni veljaven." };
  if (isDemoMode) return { ok: true };
  const d = parsed.data;
  if (d.outcome === "ordered" && !d.order) return { ok: false, error: "Vnesi naročilo ali izberi drug izid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_complete_visit", {
    p_visit_id: d.visitId,
    p_outcome: d.outcome,
    p_contact: d.contact,
    p_note: d.note,
    p_follow_up: d.followUp ?? null,
    p_samples: d.samples.map((s) => ({ product_id: s.productId, quantity: s.quantity })),
    p_lat: d.gps?.lat ?? null,
    p_lng: d.gps?.lng ?? null,
  });
  if (error) return { ok: false, error: error.message };

  if (d.outcome === "ordered" && d.order) {
    const { data: orderId, error: orderError } = await supabase.rpc("sales_field_order", orderRpcArgs(d.visitId, d.order));
    refresh();
    if (orderError) return { ok: false, error: orderError.message, visitSaved: true };
    return { ok: true, orderId: orderId as string };
  }
  refresh();
  return { ok: true };
}

/** For a visit that is already recorded but whose order did not go through (or was added later). */
export async function addOrderToVisit(visitId: string, order: z.infer<typeof OrderPart>): Promise<CompleteResult> {
  const parsed = OrderPart.safeParse(order);
  if (!Id.safeParse(visitId).success || !parsed.success) return { ok: false, error: "Naročilo ni veljavno." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_field_order", orderRpcArgs(visitId, parsed.data));
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, orderId: data as string };
}

// ------------------------------------------------------------------- car stock

const StockItems = z.array(z.object({ productId: Id, quantity: z.number().int().positive().max(5000) })).min(1).max(40);

export async function checkoutStock(items: z.infer<typeof StockItems>): Promise<ActionResult> {
  const parsed = StockItems.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Izberi vsaj en izdelek." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_stock_checkout", {
    p_items: parsed.data.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  revalidatePath("/zaloge");
  return { ok: true };
}

export async function returnStock(items: z.infer<typeof StockItems>): Promise<ActionResult> {
  const parsed = StockItems.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Izberi vsaj en izdelek." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_stock_return", {
    p_items: parsed.data.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  revalidatePath("/zaloge");
  return { ok: true };
}
