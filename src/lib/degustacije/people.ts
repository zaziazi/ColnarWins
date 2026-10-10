import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DegustacijaPerson } from "@/lib/types";
import { mapBooking } from "./map";
import { kitchenMessage, normalizePhone, presenterMessage } from "./messages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/**
 * Sends one text by SMS or WhatsApp through Twilio. Without TWILIO_* settings
 * it reports "unconfigured" and sends nothing — the screens then offer the
 * same text as a one-tap link to send by hand.
 *
 * WhatsApp note: a business-started WhatsApp message outside the 24-hour reply
 * window must be an approved template; Twilio's rules apply.
 */
export async function sendText(
  person: Pick<DegustacijaPerson, "phone" | "channel">,
  body: string,
): Promise<{ status: "sent" } | { status: "unconfigured" | "no_phone" } | { status: "error"; message: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = person.channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return { status: "unconfigured" };
  const to = normalizePhone(person.phone);
  if (!to) return { status: "no_phone" };

  const wa = person.channel === "whatsapp";
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: wa && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from,
      To: wa ? `whatsapp:${to}` : to,
      Body: body,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { status: "error", message: `Twilio ${res.status}: ${t.slice(0, 160)}` };
  }
  return { status: "sent" };
}

export interface NotifyResult {
  presenter: "sent" | "not_needed" | "no_person" | "already" | "unconfigured" | "no_phone" | "error";
  kitchen: "sent" | "not_needed" | "no_person" | "already" | "unconfigured" | "no_phone" | "error";
  errors: string[];
}

/**
 * The "day before" messages for one confirmed booking: the presenter gets the
 * group details, the kitchen person gets the bread/food notice (only when the
 * group has food). Each is sent once; `force` re-sends.
 */
export async function notifyBooking(db: Db, bookingId: string, opts: { force?: boolean } = {}): Promise<NotifyResult> {
  const { data } = await db
    .from("group_booking")
    .select(
      "id,drustvo_id,group_name,source,visit_date,arrival_time,end_time,people_planned,people_actual,wine_preferences,food,food_notes,contact_name,contact_phone,contact_email,presenter_id,kitchen_id,presenter_notified_at,kitchen_notified_at,status,wine_sales_eur,notes,web_reservation_id,drustvo(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  const result: NotifyResult = { presenter: "no_person", kitchen: "no_person", errors: [] };
  if (!data || data.status === "cancelled") return result;
  const b = mapBooking(data as Record<string, unknown>);

  const ids = [b.presenterId, b.kitchenId].filter(Boolean) as string[];
  const people = new Map<string, DegustacijaPerson>();
  if (ids.length) {
    const { data: ps } = await db.from("degustacija_person").select("id,name,phone,role,channel,is_default_kitchen,active").in("id", ids);
    for (const p of ps ?? []) {
      people.set(p.id as string, { id: p.id, name: p.name, phone: p.phone, role: p.role, channel: p.channel, isDefaultKitchen: p.is_default_kitchen, active: p.active } as DegustacijaPerson);
    }
  }

  async function one(personId: string | null, text: string, notifiedAt: string | null, column: string, needed: boolean): Promise<NotifyResult["presenter"]> {
    if (!needed) return "not_needed";
    const person = personId ? people.get(personId) : undefined;
    if (!person) return "no_person";
    if (notifiedAt && !opts.force) return "already";
    const r = await sendText(person, text);
    if (r.status === "sent") {
      await db.from("group_booking").update({ [column]: new Date().toISOString() }).eq("id", bookingId);
      return "sent";
    }
    if (r.status === "error") result.errors.push(r.message);
    return r.status;
  }

  result.presenter = await one(b.presenterId, presenterMessage(b), b.presenterNotifiedAt, "presenter_notified_at", true);
  result.kitchen = await one(b.kitchenId, kitchenMessage(b), b.kitchenNotifiedAt, "kitchen_notified_at", b.food);
  return result;
}
