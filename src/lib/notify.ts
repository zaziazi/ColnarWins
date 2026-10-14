import "server-only";
import { pushConfigured, sendPush, type PushPayload } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phone push to specific staff members (every device they switched notifications on for).
 * Never throws: a failed notification must not break the action that triggered it.
 * Uses the service-role client because subscriptions are readable only by their owner.
 */
export async function notifyStaff(
  staffIds: (string | null | undefined)[],
  payload: PushPayload,
  opts: { exceptStaffId?: string | null } = {},
): Promise<{ sent: number }> {
  try {
    if (!pushConfigured()) return { sent: 0 };
    const ids = [...new Set(staffIds.filter((x): x is string => Boolean(x)))].filter((id) => id !== opts.exceptStaffId);
    if (ids.length === 0) return { sent: 0 };

    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscription")
      .select("id,endpoint,p256dh,auth")
      .in("staff_id", ids);

    let sent = 0;
    for (const sub of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
      const r = await sendPush(sub, payload);
      if (r === "sent") sent++;
      else if (r === "gone") await admin.from("push_subscription").delete().eq("id", sub.id);
    }
    return { sent };
  } catch {
    return { sent: 0 };
  }
}
