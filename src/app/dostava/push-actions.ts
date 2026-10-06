"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(300).optional(),
});

/** Stores this device's push subscription for the signed-in staff member (upsert by endpoint). */
export async function savePushSubscription(input: z.infer<typeof SubscriptionInput>): Promise<ActionResult> {
  const parsed = SubscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neveljavna naročnina." };
  if (isDemoMode) return { ok: true };

  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, error: "Prijava potrebna." };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscription").upsert(
    {
      staff_id: staff.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (isDemoMode) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscription").delete().eq("endpoint", endpoint);
  return error ? { ok: false, error: error.message } : { ok: true };
}
