"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  revalidatePath("/pisarna");
  revalidatePath("/nacrt");
  revalidatePath("/voznik");
}

/** The driver confirms the plan - from here on it is printable (Tisk) and can be ticked off. */
export async function confirmPlan(routeId: string): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(routeId);
  if (!parsed.success) return { ok: false, error: "Neveljavna pot." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_route", { p_route_id: parsed.data });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

const DeliveredInput = z.object({
  orderId: z.string().min(1),
  delivered: z.boolean(),
  /** Omit to cross out / restore the whole order. */
  productId: z.string().min(1).optional(),
});

export async function setDelivered(input: z.infer<typeof DeliveredInput>): Promise<ActionResult> {
  const parsed = DeliveredInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_delivered", {
    p_order_id: parsed.data.orderId,
    p_delivered: parsed.data.delivered,
    p_product_id: parsed.data.productId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
