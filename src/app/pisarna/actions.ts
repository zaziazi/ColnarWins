"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

const AssignDriverInput = z.object({
  orderId: z.string().min(1),
  driverId: z.string().min(1).nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Interim direct driver assignment — see the comment on
 * sales_order.assigned_driver_id. Moves to route_stop once delivery
 * planning exists.
 */
export async function assignDriver(
  orderId: string,
  driverId: string | null,
): Promise<ActionResult> {
  const parsed = AssignDriverInput.safeParse({ orderId, driverId });
  if (!parsed.success) {
    return { ok: false, error: "Neveljaven voznik." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_order")
    .update({ assigned_driver_id: parsed.data.driverId })
    .eq("id", parsed.data.orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pisarna");
  return { ok: true };
}

const UpdateOrderInput = z.object({
  orderId: z.string().min(1),
  deliveryDate: z.string().min(1),
  note: z.string().max(500).optional().default(""),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPriceNet: z.number().nonnegative(),
        vatRate: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export type UpdateOrderInput = z.infer<typeof UpdateOrderInput>;

/**
 * Edits an existing draft order — only drafts, since a confirmed order's
 * prices are already snapshotted and shouldn't move. Lines are replaced
 * wholesale rather than diffed; simpler and the order is still a draft.
 */
export async function updateOrder(input: UpdateOrderInput): Promise<ActionResult> {
  const parsed = UpdateOrderInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Naročilo ni veljavno." };
  }
  const { orderId, deliveryDate, note, lines } = parsed.data;

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("sales_order")
    .select("status")
    .eq("id", orderId)
    .single();

  if (fetchError || !existing) {
    return { ok: false, error: "Naročilo ne obstaja." };
  }
  if (existing.status !== "draft") {
    return { ok: false, error: "Samo osnutke je mogoče urejati." };
  }

  const { error: updateError } = await supabase
    .from("sales_order")
    .update({ delivery_date: deliveryDate, driver_note: note || null })
    .eq("id", orderId);

  if (updateError) return { ok: false, error: updateError.message };

  const { error: deleteError } = await supabase
    .from("order_line")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) return { ok: false, error: deleteError.message };

  const { error: lineError } = await supabase.from("order_line").insert(
    lines.map((l) => ({
      order_id: orderId,
      product_id: l.productId,
      quantity_ordered: l.quantity,
      unit_price_net: l.unitPriceNet,
      vat_rate: l.vatRate,
    })),
  );

  if (lineError) return { ok: false, error: lineError.message };

  revalidatePath("/pisarna");
  revalidatePath(`/pisarna/${orderId}/uredi`);
  return { ok: true };
}
