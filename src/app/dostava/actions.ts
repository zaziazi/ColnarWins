"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ConfirmDeliveryInput = z.object({
  orderId: z.string().min(1),
  lines: z
    .array(z.object({ productId: z.string().min(1), quantityDelivered: z.number().int().min(0) }))
    .min(1),
  signaturePath: z.string().min(1),
  signerName: z.string().min(1).max(120),
  note: z.string().max(500).optional().default(""),
  gpsLat: z.number().nullable(),
  gpsLng: z.number().nullable(),
  gpsAccuracy: z.number().nullable(),
  deviceId: z.string().min(1),
});

/**
 * Confirms a delivery — the whole write happens inside the confirm_delivery
 * Postgres function, not several sequential calls, so a network blip
 * mid-sequence can't half-update an order. Idempotent: the sync queue on the
 * driver's device may retry this after a dropped response; the RPC treats a
 * duplicate order_id as a no-op success, not an error.
 */
export async function confirmDelivery(input: z.infer<typeof ConfirmDeliveryInput>): Promise<ActionResult> {
  const parsed = ConfirmDeliveryInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljavni podatki o dostavi." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_delivery", {
    p_order_id: parsed.data.orderId,
    p_lines: parsed.data.lines.map((l) => ({
      product_id: l.productId,
      quantity_delivered: l.quantityDelivered,
    })),
    p_signature_path: parsed.data.signaturePath,
    p_signer_name: parsed.data.signerName,
    p_note: parsed.data.note || null,
    p_gps_lat: parsed.data.gpsLat,
    p_gps_lng: parsed.data.gpsLng,
    p_gps_accuracy: parsed.data.gpsAccuracy,
    p_device_id: parsed.data.deviceId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dostava");
  revalidatePath("/pisarna");
  revalidatePath("/nacrt");
  return { ok: true };
}

const RecordFailedStopInput = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(300),
});

export async function recordFailedStop(
  input: z.infer<typeof RecordFailedStopInput>,
): Promise<ActionResult> {
  const parsed = RecordFailedStopInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven razlog." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_failed_stop", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dostava");
  revalidatePath("/nacrt");
  return { ok: true };
}

const RouteIdInput = z.object({ routeId: z.string().min(1) });

export async function startRoute(routeId: string): Promise<ActionResult> {
  const parsed = RouteIdInput.safeParse({ routeId });
  if (!parsed.success) return { ok: false, error: "Neveljavna pot." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_route", { p_route_id: parsed.data.routeId });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dostava");
  return { ok: true };
}

const PingInput = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().nullable(),
  deviceId: z.string().min(1),
  recordedAt: z.string().min(1),
});

const RecordLocationPingsInput = z.object({
  routeId: z.string().min(1),
  pings: z.array(PingInput).min(1),
});

export async function recordLocationPings(
  input: z.infer<typeof RecordLocationPingsInput>,
): Promise<ActionResult> {
  const parsed = RecordLocationPingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki lokacije." };

  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_location_pings", {
    p_route_id: parsed.data.routeId,
    p_pings: parsed.data.pings.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy_m: p.accuracyM,
      device_id: p.deviceId,
      recorded_at: p.recordedAt,
    })),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type SignatureUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

/**
 * Mints a signed upload URL for one signature image instead of accepting a
 * client-chosen path — the server picks the path (order-scoped, random
 * suffix), so an authenticated caller can never overwrite someone else's
 * signature. The image itself never passes through a Server Action body
 * (next.config.ts keeps that limit at 1MB) — the client uploads the Blob
 * directly to Storage using this token.
 */
export async function createSignatureUploadUrl(orderId: string): Promise<SignatureUploadResult> {
  const parsed = z.string().min(1).safeParse(orderId);
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };

  if (isDemoMode) {
    return { ok: true, path: `demo/${orderId}.png`, token: "demo" };
  }

  const supabase = await createClient();
  const { data: stop } = await supabase
    .from("route_stop")
    .select("id")
    .eq("order_id", parsed.data)
    .single();

  if (!stop) return { ok: false, error: "Postanek za to naročilo ne obstaja." };

  const path = `${parsed.data}/${crypto.randomUUID()}.png`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("delivery-signatures")
    .createSignedUploadUrl(path);

  if (error || !data) return { ok: false, error: error?.message ?? "Nalaganje ni uspelo." };

  return { ok: true, path: data.path, token: data.token };
}
