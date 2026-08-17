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
