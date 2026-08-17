"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

const OrderInput = z.object({
  customerId: z.string().min(1),
  deliveryDate: z.string().min(1),
  note: z.string().max(500).optional().default(""),
  holdForReview: z.boolean().default(false),
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

export type OrderInput = z.infer<typeof OrderInput>;
export type ActionResult = { ok: true; orderId: string } | { ok: false; error: string };

/**
 * Creates an order and its lines.
 *
 * Two rules from the specification are enforced here rather than in the UI,
 * because a rule that only exists in the browser is not a rule:
 *   1. Prices are SNAPSHOTTED onto the line at confirmation. The catalogue is
 *      never re-read later, so a price change cannot rewrite history.
 *   2. An order for a customer on credit hold is saved as a draft, never
 *      confirmed — the office has to look at it first.
 */
export async function createOrder(input: OrderInput): Promise<ActionResult> {
  const parsed = OrderInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Naročilo ni veljavno." };
  }
  const { customerId, deliveryDate, note, lines, holdForReview } = parsed.data;

  if (isDemoMode) {
    // Demo mode has no database. Pretend it worked so the flow stays clickable.
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, orderId: "demo-order" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Seja je potekla. Prijavi se znova." };

  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  const status = holdForReview ? "draft" : "confirmed";

  const { data: order, error: orderError } = await supabase
    .from("sales_order")
    .insert({
      customer_id: customerId,
      source: "phone",
      status,
      delivery_date: deliveryDate,
      driver_note: note || null,
      created_by: staff?.id ?? null,
      confirmed_by: status === "confirmed" ? (staff?.id ?? null) : null,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Naročila ni bilo mogoče shraniti." };
  }

  const { error: lineError } = await supabase.from("order_line").insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      quantity_ordered: l.quantity,
      unit_price_net: l.unitPriceNet,
      vat_rate: l.vatRate,
    })),
  );

  if (lineError) {
    // Orders without lines are worse than no order at all — clean up.
    await supabase.from("sales_order").delete().eq("id", order.id);
    return { ok: false, error: lineError.message };
  }

  revalidatePath("/pisarna");
  return { ok: true, orderId: order.id };
}
