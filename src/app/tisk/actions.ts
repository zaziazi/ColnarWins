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


type PrintOrders = Awaited<ReturnType<typeof getDeliveryDays>>[number]["orders"];

/** Mails the given orders of a day to the print mailbox (one mail per driver) and remembers what was sent. */
async function mailForPrint(dayDate: string, orders: PrintOrders, alwaysLabel = false): Promise<{ sent: number; failure: string | null; to: string }> {
  // One mail per driver, so each person's papers print together; orders without a driver go last.
  const groups = new Map<string, typeof orders>();
  for (const o of orders) {
    const k = o.driverName ?? "";
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const names = [...groups.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "sl")));
  const split = names.length > 1 || alwaysLabel;
  const to = printMailTo();
  const supabase = await createClient();
  const now = new Date().toISOString();
  let sent = 0;
  let failure: string | null = null;

  for (const name of names) {
    const part = groups.get(name)!;
    const label = split ? (name === "" ? "brez voznika" : `voznik ${name}`) : undefined;
    const { subject, text, html } = buildPrintMail(dayDate, part, label);
    const result = await sendMail({ to, subject, text, html, internal: true });
    if (!result.ok) {
      failure = result.error;
      continue;
    }
    sent += part.length;
    await Promise.all(
      part.map((o) =>
        supabase.from("sales_order").update({ print_sent_at: now, print_hash: o.hash }).eq("id", o.orderId),
      ),
    );
  }

  return { sent, failure, to };
}

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

  const { sent, failure, to } = await mailForPrint(day.date, orders);

  revalidatePath("/tisk");
  revalidatePath("/dostava");
  if (failure && sent === 0) return { ok: false, error: failure };
  if (failure) return { ok: false, error: `Poslano je ${sent}, ostalo ni uspelo: ${failure}` };
  return { ok: true, sent, to };
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

/**
 * A salesperson / driver sends his own orders of a day (today or the coming week) to the office for printing.
 * Unlike the office's "Pošlji v tisk" this does not wait for the day to be confirmed: it is the person himself asking for his papers.
 */
export async function sendMyOrdersToPrint(day: string, orderIds?: string[]): Promise<PrintResult> {
  if (!z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(day).success) return { ok: false, error: "Neveljaven datum." };
  if (isDemoMode) return { ok: false, error: "V demo načinu pošiljanje ni na voljo." };
  if (!mailConfigured()) return { ok: false, error: "Pošiljanje e-pošte ni nastavljeno (MAIL_FROM in SMTP_* v Vercelu)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Seja je potekla. Prijavi se znova." };
  const { data: me } = await supabase.from("staff").select("id").eq("auth_user_id", user.id).single();
  if (!me) return { ok: false, error: "Uporabnik ni najden." };

  const found = (await getDeliveryDays({ ahead: 8 })).find((d) => d.date === day);
  const wanted = orderIds && orderIds.length > 0 ? new Set(orderIds) : null;
  const orders = (found?.orders ?? []).filter((o) => !o.cancelled && o.driverId === me.id && (!wanted || wanted.has(o.orderId)));
  if (orders.length === 0) return { ok: false, error: "Za ta dan nimaš dodeljenih naročil." };

  const { sent, failure, to } = await mailForPrint(day, orders, true);
  revalidatePath("/tisk");
  revalidatePath("/dostava");
  if (failure && sent === 0) return { ok: false, error: failure };
  if (failure) return { ok: false, error: `Poslano je ${sent}, ostalo ni uspelo: ${failure}` };
  return { ok: true, sent, to };
}
