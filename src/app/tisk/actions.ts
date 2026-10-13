"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { mailConfigured, sendMail } from "@/lib/documents/email";
import { buildPrintMail, printMailTo } from "@/lib/print-mail";
import { getSimpleRoutes } from "@/lib/simple-routes";

export type PrintResult = { ok: true; sent: number; to: string } | { ok: false; error: string };

const Input = z.object({
  routeId: z.string().min(1),
  /** Omit to send every order on the route. */
  orderIds: z.array(z.string().min(1)).min(1).optional(),
});

/**
 * Mails the orders of a driver-confirmed route to the office mailbox
 * (one mail, each order on its own page when printed) and remembers when,
 * so the Tisk tab shows what already went out.
 */
export async function sendToPrint(input: z.infer<typeof Input>): Promise<PrintResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavni podatki." };
  if (isDemoMode) return { ok: false, error: "V demo načinu pošiljanje ni na voljo." };
  if (!mailConfigured()) {
    return { ok: false, error: "Pošiljanje e-pošte ni nastavljeno (MAIL_FROM in SMTP_* v Vercelu)." };
  }

  const route = (await getSimpleRoutes()).find((r) => r.id === parsed.data.routeId);
  if (!route) return { ok: false, error: "Poti ni več." };
  if (route.status === "planned") return { ok: false, error: "Voznik še ni potrdil načrta." };

  const wanted = parsed.data.orderIds ? new Set(parsed.data.orderIds) : null;
  const stops = route.stops.filter((s) => !wanted || wanted.has(s.orderId));
  if (stops.length === 0) return { ok: false, error: "Ni naročil za tisk." };

  const { subject, text, html } = buildPrintMail(route, stops);
  const to = printMailTo();
  const result = await sendMail({ to, subject, text, html, internal: true });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  await supabase
    .from("sales_order")
    .update({ print_sent_at: new Date().toISOString() })
    .in("id", stops.map((s) => s.orderId));

  revalidatePath("/tisk");
  return { ok: true, sent: stops.length, to };
}
