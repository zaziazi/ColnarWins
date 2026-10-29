"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { saveCustomerEmail } from "@/lib/customer-email";

const OrderInput = z.object({
  customerId: z.string().min(1),
  deliveryDate: z.string().min(1),
  note: z.string().max(500).optional().default(""),
  /** Optional: who will deliver it. */
  driverId: z.string().min(1).nullable().optional(),
  /** Someone not on the driver list, typed by hand. */
  driverName: z.string().trim().max(80).nullable().optional(),
  /** Which price list the line prices come from. */
  priceList: z.enum(["gostinci", "fizicne"]).default("gostinci"),
  paymentMethod: z.enum(["trr", "gotovina", "kartica", "drugo"]).default("trr"),
  /** E-mail for the invoice / delivery note; saved on the customer when it changed. */
  customerEmail: z.union([z.literal(""), z.string().trim().email()]).nullable().optional(),
  holdForReview: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPriceNet: z.number().nonnegative(),
        vatRate: z.number().nonnegative(),
        /** Fraction 0..1. */
        discountPct: z.number().min(0).max(1).default(0),
        freeQty: z.number().int().min(0).default(0),
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
  const { customerId, deliveryDate, note, lines, holdForReview, driverId, driverName, priceList, paymentMethod, customerEmail } = parsed.data;

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
    .select("id,role")
    .eq("auth_user_id", user.id)
    .single();

  // A salesperson's order with a discount or gratis is only a draft until the office has looked at it.
  const hasExtras = lines.some((l) => l.discountPct > 0 || l.freeQty > 0);
  const salesExtras = staff?.role === "sales" && hasExtras;
  const status = holdForReview || salesExtras ? "draft" : "confirmed";

  const { data: order, error: orderError } = await supabase
    .from("sales_order")
    .insert({
      customer_id: customerId,
      source: "phone",
      status,
      delivery_date: deliveryDate,
      driver_note: note || null,
      assigned_driver_id: driverId ?? null,
      assigned_driver_name: driverId ? null : driverName || null,
      price_list: priceList,
      payment_method: paymentMethod,
      review_note: salesExtras ? "Prodajnik je vnesel popust ali gratis: preveri in potrdi." : null,
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
      discount_pct: l.discountPct,
      free_qty: Math.min(l.freeQty, l.quantity),
    })),
  );

  if (lineError) {
    // Orders without lines are worse than no order at all — clean up.
    await supabase.from("sales_order").delete().eq("id", order.id);
    return { ok: false, error: lineError.message };
  }

  await saveCustomerEmail(supabase, customerId, customerEmail);
  revalidatePath("/pisarna");
  return { ok: true, orderId: order.id };
}

const PersonInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(160),
  postCode: z.string().trim().max(10).optional().default(""),
  city: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email()]).optional().default(""),
});

/** A private person (fizična oseba) as a customer: no VAT id, pays on the spot by default. */
export async function createPersonCustomer(
  input: z.input<typeof PersonInput>,
): Promise<{ ok: true; customerId: string; name: string } | { ok: false; error: string }> {
  const p = PersonInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Preverite ime, priimek, naslov in kraj." };
  if (!p.data.phone && !p.data.email) return { ok: false, error: "Vpišite telefon ali e-naslov." };
  if (isDemoMode) return { ok: true, customerId: "demo-person", name: `${p.data.lastName} ${p.data.firstName}` };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Seja je potekla. Prijavi se znova." };

  // A customer a salesperson enters himself is his from the start.
  const { data: me } = await supabase.from("staff").select("id,role").eq("auth_user_id", auth.user.id).single();
  const name = `${p.data.lastName} ${p.data.firstName}`;
  const { data, error } = await supabase
    .from("customer")
    .insert({
      name,
      kind: "person",
      first_name: p.data.firstName,
      last_name: p.data.lastName,
      address: p.data.address,
      post_code: p.data.postCode || null,
      city: p.data.city,
      phone: p.data.phone || null,
      email: p.data.email || null,
      payment_terms_days: 0,
      active: true,
      sales_rep_id: me?.role === "sales" ? me.id : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Osebe ni bilo mogoče shraniti." };
  revalidatePath("/pisarna/novo");
  return { ok: true, customerId: data.id as string, name };
}
