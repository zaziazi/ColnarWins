"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo";
import { getCurrentStaff } from "@/lib/data";
import { saveCustomerEmail } from "@/lib/customer-email";
import { sendStoredDocuments } from "@/lib/documents/finalize";
import { lineGross } from "@/lib/format";

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
    .update({ assigned_driver_id: parsed.data.driverId, assigned_driver_name: null })
    .eq("id", parsed.data.orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pisarna");
  return { ok: true };
}

const OrderIdInput = z.object({ orderId: z.string().min(1) });

/** Moves a draft to confirmed once the office has looked it over. */
export async function confirmOrder(orderId: string): Promise<ActionResult> {
  const parsed = OrderIdInput.safeParse({ orderId });
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
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

  const { data: existing, error: fetchError } = await supabase
    .from("sales_order")
    .select("status")
    .eq("id", parsed.data.orderId)
    .single();

  if (fetchError || !existing) return { ok: false, error: "Naročilo ne obstaja." };
  if (existing.status !== "draft") {
    return { ok: false, error: "Naročilo ni več osnutek." };
  }

  const { error } = await supabase
    .from("sales_order")
    .update({
      status: "confirmed",
      confirmed_by: staff?.id ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pisarna");
  return { ok: true };
}

const CANCELLABLE_STATUSES = ["draft", "confirmed", "planned"];

const CancelOrderInput = z.object({
  orderId: z.string().min(1),
  reason: z.string().max(300).optional().default(""),
});

/**
 * Cancels an order. Allowed up through "planned" — once a driver has
 * actually delivered it (or it's invoiced), cancelling here would silently
 * disagree with reality, so it's locked.
 */
export async function cancelOrder(orderId: string, reason?: string): Promise<ActionResult> {
  const parsed = CancelOrderInput.safeParse({ orderId, reason });
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  if (!(await officeOnly())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("sales_order")
    .select("status")
    .eq("id", parsed.data.orderId)
    .single();

  if (fetchError || !existing) return { ok: false, error: "Naročilo ne obstaja." };
  if (!CANCELLABLE_STATUSES.includes(existing.status)) {
    return { ok: false, error: "Tega naročila ni več mogoče preklicati." };
  }

  const { error } = await supabase
    .from("sales_order")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason || null,
    })
    .eq("id", parsed.data.orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pisarna");
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  return { ok: true };
}

/** Cancelling, restoring and deleting are for the office and management only. */
async function officeOnly(): Promise<boolean> {
  const me = await getCurrentStaff();
  return me?.role === "manager" || me?.role === "office";
}

/**
 * Takes a cancelled order back. It returns as "confirmed" when it had been confirmed before, otherwise as a draft.
 * For the mistaken cancel: nothing else about the order was touched.
 */
export async function restoreOrder(orderId: string): Promise<ActionResult> {
  const parsed = OrderIdInput.safeParse({ orderId });
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };
  if (isDemoMode) return { ok: true };
  if (!(await officeOnly())) return { ok: false, error: "Ni dostopa." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("sales_order").select("status,confirmed_at").eq("id", parsed.data.orderId).single();
  if (!existing) return { ok: false, error: "Naročilo ne obstaja." };
  if (existing.status !== "cancelled") return { ok: false, error: "Naročilo ni preklicano." };

  const { error } = await supabase
    .from("sales_order")
    .update({ status: existing.confirmed_at ? "confirmed" : "draft", cancelled_at: null, cancel_reason: null })
    .eq("id", parsed.data.orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pisarna");
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  revalidatePath("/prodaja/narocila");
  return { ok: true };
}

/**
 * Permanently deletes an order that was never delivered (draft, confirmed, planned or cancelled) with its lines.
 * A delivered order has its own, stricter delete. If the order is already tied to a route, an invoice or a sent mail
 * the database refuses, and we say so instead of leaving things half-deleted.
 */
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  const parsed = OrderIdInput.safeParse({ orderId });
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };
  if (isDemoMode) return { ok: true };
  if (!(await officeOnly())) return { ok: false, error: "Ni dostopa." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("sales_order").select("status").eq("id", parsed.data.orderId).single();
  if (!existing) return { ok: false, error: "Naročilo ne obstaja." };
  if (existing.status === "delivered" || existing.status === "invoiced") {
    return { ok: false, error: "Dostavljenega naročila izbriši pri dostavljenih naročilih." };
  }

  const { data, error } = await supabase
    .from("sales_order")
    .delete()
    .eq("id", parsed.data.orderId)
    .in("status", ["draft", "confirmed", "planned", "cancelled"])
    .select("id");
  if (error) {
    return {
      ok: false,
      error: error.code === "23503" ? "Naročila ni mogoče izbrisati, ker je že povezano s potjo dostave, računom ali poslano e-pošto. Raje ga prekliči." : error.message,
    };
  }
  if (!data || data.length === 0) return { ok: false, error: "Naročila ni bilo mogoče izbrisati." };

  revalidatePath("/pisarna");
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  revalidatePath("/prodaja/narocila");
  return { ok: true };
}

const UpdateOrderInput = z.object({
  orderId: z.string().min(1),
  deliveryDate: z.string().min(1),
  note: z.string().max(500).optional().default(""),
  driverId: z.string().min(1).nullable().optional(),
  driverName: z.string().trim().max(80).nullable().optional(),
  priceList: z.enum(["gostinci", "fizicne"]).default("gostinci"),
  paymentMethod: z.enum(["trr", "gotovina", "kartica", "drugo"]).default("trr"),
  customerEmail: z.union([z.literal(""), z.string().trim().email()]).nullable().optional(),
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
  const { orderId, deliveryDate, note, lines, driverId, driverName, priceList, paymentMethod, customerEmail } = parsed.data;

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("sales_order")
    .select("status,price_list,customer_id,created_by")
    .eq("id", orderId)
    .single();

  if (fetchError || !existing) {
    return { ok: false, error: "Naročilo ne obstaja." };
  }
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return { ok: false, error: "Tega naročila ni več mogoče urejati." };
  }

  // A salesperson edits only orders of his own customers or ones he entered himself,
  // and a discount or gratis puts the order back to the office for a look, like a new one.
  const { data: auth } = await supabase.auth.getUser();
  const { data: actor } = auth.user
    ? await supabase.from("staff").select("id,role").eq("auth_user_id", auth.user.id).single()
    : { data: null };
  const isSales = actor?.role === "sales";
  if (isSales) {
    const { data: cust } = await supabase.from("customer").select("sales_rep_id").eq("id", existing.customer_id).single();
    if (cust?.sales_rep_id !== actor.id && existing.created_by !== actor.id) {
      return { ok: false, error: "To naročilo ni tvoje." };
    }
  }
  const holdForOffice = isSales && lines.some((l) => l.discountPct > 0 || l.freeQty > 0);

  const { error: updateError } = await supabase
    .from("sales_order")
    .update({
      delivery_date: deliveryDate,
      driver_note: note || null,
      assigned_driver_id: driverId ?? null,
      assigned_driver_name: driverId ? null : driverName || null,
      price_list: priceList,
      payment_method: paymentMethod,
      ...(holdForOffice ? { status: "draft", review_note: "Prodajnik je vnesel popust ali gratis: preveri in potrdi." } : {}),
    })
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
    // switching the price list re-prices every line; otherwise confirmed lines keep their snapshot
    const prior = existing.status === "confirmed" && existing.price_list === priceList ? priorByProduct.get(l.productId) : undefined;
    return {
      order_id: orderId,
      product_id: l.productId,
      quantity_ordered: l.quantity,
      unit_price_net: prior?.unitPriceNet ?? l.unitPriceNet,
      vat_rate: prior?.vatRate ?? l.vatRate,
      discount_pct: l.discountPct,
      free_qty: Math.min(l.freeQty, l.quantity),
    };
  });

  const { error: deleteError } = await supabase
    .from("order_line")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) return { ok: false, error: deleteError.message };

  const { error: lineError } = await supabase.from("order_line").insert(resolvedLines);

  if (lineError) return { ok: false, error: lineError.message };

  await saveCustomerEmail(supabase, existing.customer_id as string, customerEmail);
  revalidatePath("/pisarna");
  revalidatePath("/prodaja/narocila");
  revalidatePath(`/pisarna/${orderId}/uredi`);
  return { ok: true };
}

const SendDocsInput = z.object({
  orderId: z.string().min(1),
  recipient: z.union([z.literal(""), z.string().email()]),
});

/**
 * Office (re)sends the stored dobavnica + račun — used when the customer had
 * no e-mail on file, the first send failed, or sending wasn't configured yet.
 * A typed recipient replaces the one on the outbox row.
 */
export async function sendDeliveryDocuments(
  orderId: string,
  recipient: string,
): Promise<ActionResult> {
  const parsed = SendDocsInput.safeParse({ orderId, recipient: recipient.trim() });
  if (!parsed.success) return { ok: false, error: "Neveljaven e-naslov." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const { status, error } = await sendStoredDocuments(
    parsed.data.orderId,
    parsed.data.recipient || undefined,
  );
  revalidatePath("/pisarna");

  if (status === "sent") return { ok: true };
  if (status === "no_recipient") return { ok: false, error: "Vnesi e-naslov prejemnika." };
  return { ok: false, error: error ?? "Pošiljanje ni uspelo." };
}

/**
 * Hard-deletes a delivered/invoiced order with everything it produced: the
 * signature record, receipt, mail record, stop — and the stored signature and
 * PDFs. For cleaning up test deliveries; refuses if a payment was recorded.
 */
export async function deleteDeliveredOrder(orderId: string): Promise<ActionResult> {
  const parsed = OrderIdInput.safeParse({ orderId });
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_delivered_order", { p_order_id: parsed.data.orderId });
  if (error) return { ok: false, error: error.message };

  // The database rows are gone; remove the files too. A leftover file is
  // harmless clutter, so a failure here doesn't fail the delete.
  try {
    const paths = data as { signature_paths: string[]; document_paths: string[] };
    const admin = createAdminClient();
    if (paths.signature_paths.length) await admin.storage.from("delivery-signatures").remove(paths.signature_paths);
    if (paths.document_paths.length) await admin.storage.from("delivery-documents").remove(paths.document_paths);
  } catch (e) {
    console.error("deleteDeliveredOrder: storage cleanup failed", e);
  }

  revalidatePath("/pisarna");
  revalidatePath("/nacrt");
  revalidatePath("/dostava");
  revalidatePath("/finance");
  return { ok: true };
}

/** Confirms several drafts in one go (the web table). Each one keeps the same checks as a single confirmation. */
export async function confirmOrders(orderIds: string[]): Promise<{ ok: true; confirmed: number; skipped: number } | { ok: false; error: string }> {
  const ids = z.array(z.string().min(1)).min(1).max(100).safeParse(orderIds);
  if (!ids.success) return { ok: false, error: "Neveljavna izbira." };
  let confirmed = 0;
  let skipped = 0;
  for (const id of ids.data) {
    const r = await confirmOrder(id);
    if (r.ok) confirmed++;
    else skipped++;
  }
  return { ok: true, confirmed, skipped };
}


// ------------------------------------------------------------- invoice + payment marks

const IdList = z.array(z.string().uuid()).min(1).max(200);
export type MarkResult = { ok: true; done: number; skipped: number } | { ok: false; error: string };

function refreshMoney() {
  revalidatePath("/pisarna");
  revalidatePath("/dostava");
  revalidatePath("/tisk");
  revalidatePath("/finance");
}

/**
 * "Račun izdan": the office writes down that the invoice for a delivered order was issued (in e-računi, for now by hand).
 * Only delivered orders: the invoice follows the delivery, never the order. A single invoice number can be kept.
 */
export async function markInvoiced(orderIds: string[], invoiceNumber?: string | null): Promise<MarkResult> {
  const ids = IdList.safeParse(orderIds);
  if (!ids.success) return { ok: false, error: "Izberite naročila." };
  const number = (invoiceNumber ?? "").trim().slice(0, 60) || null;
  if (number && ids.data.length > 1) return { ok: false, error: "Številko računa vpišite pri posameznem naročilu." };
  if (isDemoMode) return { ok: true, done: ids.data.length, skipped: 0 };

  const supabase = await createClient();
  const { data: orders } = await supabase.from("sales_order").select("id,status").in("id", ids.data);
  const ready = (orders ?? []).filter((o) => o.status === "delivered").map((o) => o.id as string);
  if (ready.length === 0) return { ok: false, error: "Račun je mogoče označiti šele, ko je naročilo dostavljeno." };

  const { error } = await supabase
    .from("sales_order")
    .update({ status: "invoiced", invoiced_at: new Date().toISOString(), invoice_number: number, invoice_waived: false, invoice_waived_note: null })
    .in("id", ready);
  if (error) return { ok: false, error: error.message };
  refreshMoney();
  return { ok: true, done: ready.length, skipped: ids.data.length - ready.length };
}

/** Takes the "račun izdan" mark back (a slip of the finger). Refused when the app itself holds an invoice for the order. */
export async function unmarkInvoiced(orderId: string): Promise<ActionResult> {
  const p = OrderIdInput.safeParse({ orderId });
  if (!p.success) return { ok: false, error: "Neveljavno naročilo." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { count } = await supabase.from("invoice").select("id", { count: "exact", head: true }).eq("order_id", p.data.orderId);
  if ((count ?? 0) > 0) return { ok: false, error: "Za to naročilo obstaja račun v Colnixu, oznake ni mogoče odstraniti." };
  const { error } = await supabase
    .from("sales_order")
    .update({ status: "delivered", invoiced_at: null, invoice_number: null })
    .eq("id", p.data.orderId)
    .eq("status", "invoiced");
  if (error) return { ok: false, error: error.message };
  refreshMoney();
  return { ok: true };
}

const PaidInput = z.object({
  orderIds: IdList,
  method: z.enum(["trr", "gotovina", "kartica", "drugo"]),
  /** Cash sale where no invoice is issued. A reason is required. */
  waiveInvoice: z.boolean().default(false),
  note: z.string().trim().max(300).optional().default(""),
});

/** "Plačano": marks orders as paid (typically cash at the door) and keeps the amount. */
export async function markOrdersPaid(input: z.input<typeof PaidInput>): Promise<MarkResult> {
  const p = PaidInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Preverite izbiro." };
  const { orderIds, method, waiveInvoice, note } = p.data;
  if (waiveInvoice && note.length < 3) return { ok: false, error: "Pri prodaji brez računa vpišite razlog." };
  if (isDemoMode) return { ok: true, done: orderIds.length, skipped: 0 };

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("sales_order")
    .select("id,status,paid_at,order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty)")
    .in("id", orderIds);
  const rows = (orders ?? []).filter((o) => ["confirmed", "planned", "delivered", "invoiced"].includes(o.status as string) && !o.paid_at);
  if (rows.length === 0) return { ok: false, error: "Naročila so že plačana ali še niso potrjena." };

  const now = new Date().toISOString();
  for (const o of rows) {
    const amount = Math.round((o.order_line ?? []).reduce((s: number, l: Parameters<typeof lineGross>[0]) => s + lineGross(l), 0) * 100) / 100;
    const { error } = await supabase
      .from("sales_order")
      .update({
        paid_at: now,
        paid_amount: amount,
        payment_method: method,
        ...(waiveInvoice ? { invoice_waived: true, invoice_waived_note: note } : {}),
      })
      .eq("id", o.id);
    if (error) return { ok: false, error: error.message };
  }
  refreshMoney();
  return { ok: true, done: rows.length, skipped: orderIds.length - rows.length };
}

export async function unmarkOrderPaid(orderId: string): Promise<ActionResult> {
  const p = OrderIdInput.safeParse({ orderId });
  if (!p.success) return { ok: false, error: "Neveljavno naročilo." };
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_order")
    .update({ paid_at: null, paid_amount: null, invoice_waived: false, invoice_waived_note: null })
    .eq("id", p.data.orderId);
  if (error) return { ok: false, error: error.message };
  refreshMoney();
  return { ok: true };
}
