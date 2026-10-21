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

const TakeInput = z.object({ orderIds: z.array(z.string().min(1)).min(1).max(100) });

/** The signed-in driver takes orders that have no driver yet ("Prevzemam"). Orders that already have one are left alone. */
export async function takeOrders(orderIds: string[]): Promise<ActionResult> {
  const parsed = TakeInput.safeParse({ orderIds });
  if (!parsed.success) return { ok: false, error: "Neveljavna naročila." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from("staff").select("id").eq("auth_user_id", user.id).single()
    : { data: null };
  if (!staff) return { ok: false, error: "Prijava potrebna." };

  const { error } = await supabase
    .from("sales_order")
    .update({ assigned_driver_id: staff.id, assigned_driver_name: null })
    .in("id", parsed.data.orderIds)
    .is("assigned_driver_id", null)
    .is("assigned_driver_name", null);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}


const BreakageInput = z.object({
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(1000),
  note: z.string().trim().max(200).optional().default(""),
});

/**
 * Bottles broken on the way or at the door: written off the warehouse stock with a reason, so the stock
 * count stays true. The order itself is not changed (change the delivered quantity if the customer got fewer).
 */
export async function recordBreakage(input: z.input<typeof BreakageInput>): Promise<ActionResult> {
  const p = BreakageInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Vpišite količino." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { data: o } = await supabase.from("sales_order").select("order_number,customer(name)").eq("id", p.data.orderId).maybeSingle();
  if (!o) return { ok: false, error: "Naročilo ne obstaja." };
  const customer = (o.customer as unknown as { name: string } | null)?.name ?? "";
  const { error } = await supabase.rpc("record_write_off", {
    p_product_id: p.data.productId,
    p_qty: p.data.qty,
    p_reason: `Razbitje pri dostavi #${o.order_number} ${customer}`.trim(),
    p_note: p.data.note || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/zaloge");
  return { ok: true };
}
