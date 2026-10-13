"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDeliveryDays } from "@/lib/delivery-days";
import { mailConfigured, sendMail } from "@/lib/documents/email";
import { buildPrintMail, printMailTo } from "@/lib/print-mail";

export type PrintResult = { ok: true; sent: number; to: string } | { ok: false; error: string };

const Input = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Omit to send every (non-cancelled) order of the day. */
  orderIds: z.array(z.string().min(1)).min(1).optional(),
});

/**
 * Mails the orders of a driver-confirmed day to the office mailbox (one
 * mail, each order on its own page when printed) and remembers when and what
 * was sent, so Tisk can show what is new or changed since.
 */
export async function sendToPrint(input: z.infer<typeof Input>): Promise<PrintResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki." };
  if (isDemoMode) return { ok: false, error: "V demo načinu pošiljanje ni na voljo." };
  if (!mailConfigured()) {
    return { ok: false, error: "Pošiljanje e-pošte ni nastavljeno (MAIL_FROM in SMTP_* v Vercelu)." };
  }

  const day = (await getDeliveryDays()).find((d) => d.date === parsed.data.day);
  if (!day) return { ok: false, error: "Za ta dan ni naročil." };
  if (!day.confirmedAt) return { ok: false, error: "Voznik še ni potrdil dostave za ta dan." };

  const wanted = parsed.data.orderIds ? new Set(parsed.data.orderIds) : null;
  const orders = day.orders.filter((o) => !o.cancelled && (!wanted || wanted.has(o.orderId)));
  if (orders.length === 0) return { ok: false, error: "Ni naročil za tisk." };

  const { subject, text, html } = buildPrintMail(day.date, orders);
  const to = printMailTo();
  const result = await sendMail({ to, subject, text, html, internal: true });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  const now = new Date().toISOString();
  await Promise.all(
    orders.map((o) =>
      supabase.from("sales_order").update({ print_sent_at: now, print_hash: o.hash }).eq("id", o.orderId),
    ),
  );

  revalidatePath("/tisk");
  revalidatePath("/dostava");
  return { ok: true, sent: orders.length, to };
}

/**
 * Clears a cancelled order from Tisk and Dostava once the office has seen
 * it. Only cancelled orders can be cleared; the order itself is kept.
 */
export async function dismissCancelled(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.string().min(1).safeParse(orderId);
  if (!parsed.success) return { ok: false, error: "Neveljavno naročilo." };
  if (isDemoMode) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_order")
    .update({ print_dismissed_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("status", "cancelled");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tisk");
  revalidatePath("/dostava");
  return { ok: true };
}
