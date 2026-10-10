import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushConfigured, sendPush, type PushPayload } from "@/lib/push";

/**
 * Sends a web push to the people who handle društva replies: the staff ticked
 * in drustvo_settings.notify_staff_ids, or every active manager when nobody is.
 */
export async function pushToDrustvaStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; devices: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0, devices: 0 };

  const { data: settings } = await admin.from("drustvo_settings").select("notify_staff_ids").eq("id", 1).maybeSingle();
  let staffIds: string[] = (settings?.notify_staff_ids as string[] | null) ?? [];
  if (staffIds.length === 0) {
    const { data: managers } = await admin.from("staff").select("id").eq("role", "manager").eq("active", true);
    staffIds = (managers ?? []).map((m: { id: string }) => m.id);
  }
  if (staffIds.length === 0) return { sent: 0, removed: 0, devices: 0 };

  const { data: subs } = await admin.from("push_subscription").select("id,endpoint,p256dh,auth").in("staff_id", staffIds);
  let sent = 0;
  let removed = 0;
  for (const sub of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    const r = await sendPush(sub, payload);
    if (r === "sent") sent++;
    else if (r === "gone") {
      removed++;
      await admin.from("push_subscription").delete().eq("id", sub.id);
    }
  }
  return { sent, removed, devices: subs?.length ?? 0 };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The "something arrived" push: sent for every new reply, with or without an AI summary. */
export async function notifyNewReply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  taskId: string,
) {
  const { data: task } = await admin
    .from("drustvo_reply_task")
    .select("id,summary,drustvo(name),drustvo_message(from_email,subject,body_text)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return;
  const d = task.drustvo as unknown as { name: string } | null;
  const m = task.drustvo_message as unknown as { from_email: string | null; subject: string | null; body_text: string | null } | null;
  const who = d?.name ?? m?.from_email ?? "Neznan pošiljatelj";
  const text = (task.summary as string | null) ?? m?.body_text?.replace(/\s+/g, " ").trim() ?? m?.subject ?? "Nov odgovor";
  await pushToDrustvaStaff(admin, {
    title: `Degustacije · nov odgovor · ${who}`,
    body: clip(text, 120),
    url: "/degustacije",
    tag: `drustvo-reply-${taskId}`,
  });
}
