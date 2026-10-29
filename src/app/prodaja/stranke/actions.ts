"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRealStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Manager only: say whose customer this is (null = nobody's, e.g. the customers from before Žak). */
export async function setCustomerRep(customerId: string, repId: string | null): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(customerId).success || (repId !== null && !z.string().uuid().safeParse(repId).success)) {
    return { ok: false, error: "Neveljaven vnos." };
  }
  if (isDemoMode) return { ok: true };
  const me = await getRealStaff();
  if (me?.role !== "manager") return { ok: false, error: "Stranke prodajalcem dodeljuje vodstvo." };

  const supabase = await createClient();
  const { error } = await supabase.from("customer").update({ sales_rep_id: repId }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/prodaja/stranke");
  revalidatePath("/prodaja/narocila");
  return { ok: true };
}
