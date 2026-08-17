"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const AdjustStockInput = z.object({
  productId: z.string().min(1),
  delta: z.number().int().refine((n) => n !== 0, "Vnesi količino, ki ni nič."),
  note: z.string().max(300).optional().default(""),
});

export async function adjustStock(input: z.infer<typeof AdjustStockInput>): Promise<ActionResult> {
  const parsed = AdjustStockInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neveljaven popravek." };
  }

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_stock_adjustment", {
    p_product_id: parsed.data.productId,
    p_delta: parsed.data.delta,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/zaloge");
  return { ok: true };
}
