"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { notifyStaff } from "@/lib/notify";

export type ActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  revalidatePath("/pisarna");
  revalidatePath("/nacrt");
  revalidatePath("/voznik");
}

const DayInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The driver confirms a delivery day - from here on it is printable (Tisk) and can be ticked off. */
export async function confirmDay(day: string): Promise<ActionResult> {
  const parsed = DayInput.safeParse(day);
  if (!parsed.success) return { ok: false, error: "Neveljaven datum." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from("staff").select("id").eq("auth_user_id", user.id).single()
    : { data: null };

  const { data: already } = await supabase.from("delivery_day").select("day").eq("day", parsed.data).maybeSingle();

  const { error } = await supabase
    .from("delivery_day")
    .upsert({ day: parsed.data, confirmed_by: staff?.id ?? null, confirmed_at: new Date().toISOString() }, { onConflict: "day", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };

  // tell the people who print that this day is ready (not the one who just confirmed it, and only the first time)
  if (already) {
    refresh();
    return { ok: true };
  }
  const [{ data: printers }, { count }] = await Promise.all([
    supabase.from("staff").select("id").eq("active", true).eq("notify_print", true),
    supabase
      .from("sales_order")
      .select("id", { count: "exact", head: true })
      .eq("delivery_date", parsed.data)
      .in("status", ["confirmed", "planned", "delivered", "invoiced"]),
  ]);
  const [, mm, dd] = parsed.data.split("-").map(Number);
  await notifyStaff(
    (printers ?? []).map((p: { id: string }) => p.id),
    {
      title: "Dostava potrjena, za tisk",
      body: `${dd}. ${mm}.: ${count ?? 0} ${count === 1 ? "naročilo" : "naročil"} je pripravljenih za tisk.`,
      url: "/tisk",
      tag: `print-${parsed.data}`,
    },
    { exceptStaffId: staff?.id ?? null },
  );

  refresh();
  return { ok: true };
}

/** Takes a confirmation back (e.g. tapped by mistake). Refused once anything for that day was mailed to print. */
export async function unconfirmDay(day: string): Promise<ActionResult> {
  const parsed = DayInput.safeParse(day);
  if (!parsed.success) return { ok: false, error: "Neveljaven datum." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { count } = await supabase
    .from("sales_order")
    .select("id", { count: "exact", head: true })
    .eq("delivery_date", parsed.data)
    .not("print_sent_at", "is", null);
  if ((count ?? 0) > 0) return { ok: false, error: "Naročila za ta dan so že poslana v tisk." };

  const { error } = await supabase.from("delivery_day").delete().eq("day", parsed.data);
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
