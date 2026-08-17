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

const EDITABLE_STATUSES = ["draft", "confirmed"];

/**
 * Edits an existing draft or confirmed order. Planned/delivered/invoiced/
 * cancelled orders stay locked — editing those would misalign a route, a
 * delivery, or an already-issued invoice.
 *
 * For a draft, lines re-price to today's catalogue (nothing is confirmed
 * yet, so there's no history to protect). For a confirmed order, a line
 * that already existed keeps its originally snapshotted price even if the
 * catalogue changed since — "snapshotted at confirmation" means exactly
 * that. Only a genuinely new line (a product not previously on the order)
 * gets today's catalogue price.
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
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return { ok: false, error: "Tega naročila ni več mogoče urejati." };
  }

  const { error: updateError } = await supabase
    .from("sales_order")
    .update({ delivery_date: deliveryDate, driver_note: note || null })
    .eq("id", orderId);

  if (updateError) return { ok: false, error: updateError.message };

  const { data: priorLines, error: priorError } = await supabase
    .from("order_line")
    .select("product_id,unit_price_net,vat_rate")
    .eq("order_id", orderId);

  if (priorError) return { ok: false, error: priorError.message };

  const priorByProduct = new Map(
    (priorLines ?? []).map((l) => [
      l.product_id,
      { unitPriceNet: Number(l.unit_price_net), vatRate: Number(l.vat_rate) },
    ]),
  );

  const resolvedLines = lines.map((l) => {
    const prior = existing.status === "confirmed" ? priorByProduct.get(l.productId) : undefined;
    return {
      order_id: orderId,
      product_id: l.productId,
      quantity_ordered: l.quantity,
      unit_price_net: prior?.unitPriceNet ?? l.unitPriceNet,
      vat_rate: prior?.vatRate ?? l.vatRate,
    };
  });

  const { error: deleteError } = await supabase
    .from("order_line")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) return { ok: false, error: deleteError.message };

  const { error: lineError } = await supabase.from("order_line").insert(resolvedLines);

  if (lineError) return { ok: false, error: lineError.message };

  revalidatePath("/pisarna");
  revalidatePath(`/pisarna/${orderId}/uredi`);
  return { ok: true };
}
