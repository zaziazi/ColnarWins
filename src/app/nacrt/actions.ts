"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateRouteResult = { ok: true; routeId: string } | { ok: false; error: string };

const CreateRouteInput = z.object({
  date: z.string().min(1),
  vehicle: z.string().min(1).max(120),
  driverId: z.string().min(1).nullable(),
});

export async function createRoute(
  input: z.infer<typeof CreateRouteInput>,
): Promise<CreateRouteResult> {
  const parsed = CreateRouteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki poti." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true, routeId: "demo-route" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route")
    .insert({
      route_date: parsed.data.date,
      vehicle: parsed.data.vehicle,
      driver_id: parsed.data.driverId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Poti ni bilo mogoče ustvariti." };
  }

  revalidatePath("/nacrt");
  return { ok: true, routeId: data.id };
}

const AddStopInput = z.object({
  routeId: z.string().min(1),
  orderId: z.string().min(1),
});

/**
 * Adds an order as the next stop on a route. An order can only ever be on
 * one route (route_stop.order_id is unique), so this also implicitly moves
 * it out of the unrouted pool.
 */
export async function addStopToRoute(
  input: z.infer<typeof AddStopInput>,
): Promise<ActionResult> {
  const parsed = AddStopInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki postanka." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }

  const supabase = await createClient();
  const { routeId, orderId } = parsed.data;

  const { data: existing, error: seqError } = await supabase
    .from("route_stop")
    .select("sequence")
    .eq("route_id", routeId)
    .order("sequence", { ascending: false })
    .limit(1);

  if (seqError) return { ok: false, error: seqError.message };

  const nextSequence = (existing?.[0]?.sequence ?? 0) + 1;

  const { error } = await supabase
    .from("route_stop")
    .insert({ route_id: routeId, order_id: orderId, sequence: nextSequence });

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("sales_order")
    .update({ status: "planned", planned_at: new Date().toISOString() })
    .eq("id", orderId);

  revalidatePath("/nacrt");
  revalidatePath("/pisarna");
  return { ok: true };
}

const StopIdInput = z.object({ stopId: z.string().min(1) });

/** Removes a stop — the order returns to the unrouted pool. */
export async function removeStop(stopId: string): Promise<ActionResult> {
  const parsed = StopIdInput.safeParse({ stopId });
  if (!parsed.success) return { ok: false, error: "Neveljaven postanek." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }

  const supabase = await createClient();

  const { data: stop } = await supabase
    .from("route_stop")
    .select("order_id")
    .eq("id", parsed.data.stopId)
    .single();

  const { error } = await supabase.from("route_stop").delete().eq("id", parsed.data.stopId);

  if (error) return { ok: false, error: error.message };

  if (stop?.order_id) {
    await supabase
      .from("sales_order")
      .update({ status: "confirmed", planned_at: null })
      .eq("id", stop.order_id)
      .eq("status", "planned");
  }

  revalidatePath("/nacrt");
  revalidatePath("/pisarna");
  return { ok: true };
}

const MoveStopInput = z.object({
  stopId: z.string().min(1),
  direction: z.enum(["up", "down"]),
});

/** Swaps this stop's sequence with its neighbour in the same route. */
export async function moveStop(
  input: z.infer<typeof MoveStopInput>,
): Promise<ActionResult> {
  const parsed = MoveStopInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljaven premik." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }

  const supabase = await createClient();
  const { stopId, direction } = parsed.data;

  const { data: stop, error: stopError } = await supabase
    .from("route_stop")
    .select("id,route_id,sequence")
    .eq("id", stopId)
    .single();

  if (stopError || !stop) return { ok: false, error: "Postanek ne obstaja." };

  const { data: neighbours, error: neighbourError } = await supabase
    .from("route_stop")
    .select("id,sequence")
    .eq("route_id", stop.route_id)
    .order("sequence");

  if (neighbourError) return { ok: false, error: neighbourError.message };

  const ordered = neighbours ?? [];
  const idx = ordered.findIndex((s) => s.id === stopId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) {
    return { ok: true }; // already at the edge — no-op, not an error
  }

  const a = ordered[idx];
  const b = ordered[swapIdx];

  // route_stop has a unique(route_id, sequence) constraint that isn't
  // deferrable, so swapping two rows' sequence values directly would
  // collide mid-swap. Bounce through a value neither row uses instead.
  const tempSequence = -1;

  const { error: step1 } = await supabase
    .from("route_stop")
    .update({ sequence: tempSequence })
    .eq("id", a.id);
  if (step1) return { ok: false, error: step1.message };

  const { error: step2 } = await supabase
    .from("route_stop")
    .update({ sequence: a.sequence })
    .eq("id", b.id);
  if (step2) return { ok: false, error: step2.message };

  const { error: step3 } = await supabase
    .from("route_stop")
    .update({ sequence: b.sequence })
    .eq("id", a.id);
  if (step3) return { ok: false, error: step3.message };

  revalidatePath("/nacrt");
  return { ok: true };
}
