import { NextResponse } from "next/server";
import { buildSalesPlan } from "@/lib/sales/plan";
import { pushConfigured, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "Europe/Ljubljana";
const SEND_HOUR = 7;
const JOB = "sales-plan";

/** Local Ljubljana wall clock for `now`: YYYY-MM-DD and hour 0-23. */
function ljubljanaNow(now = new Date()): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return { date, hour };
}

/**
 * Daily 07:00 (Europe/Ljubljana) list of today's visits, pushed to the
 * salesperson. Vercel cron is UTC and has no DST awareness, so vercel.json
 * fires at both 05:00 and 06:00 UTC and this handler only acts when the
 * Ljubljana hour is 7. Query params (secret still required): force=1 skips the hour check and
 * the already-sent guard, dry=1 returns the messages without sending,
 * date=YYYY-MM-DD plans a specific day.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams;
  const force = q.get("force") === "1";
  const dry = q.get("dry") === "1";

  const now = ljubljanaNow();
  if (!force && !dry && now.hour !== SEND_HOUR) {
    return NextResponse.json({ skipped: `Ljubljana hour is ${now.hour}, not ${SEND_HOUR}` });
  }
  const forDate = q.get("date") ?? now.date;

  if (!dry && !pushConfigured()) {
    return NextResponse.json({ error: "VAPID keys are not configured" }, { status: 503 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No database access" }, { status: 503 });
  }

  if (!force && !dry) {
    const { data: prior } = await admin
      .from("job_run")
      .select("id")
      .eq("job_name", JOB)
      .eq("ok", true)
      .contains("detail", { forDate })
      .gte("started_at", new Date(Date.now() - 20 * 3600_000).toISOString())
      .limit(1);
    if (prior && prior.length > 0) return NextResponse.json({ skipped: `already sent for ${forDate}` });
  }

  const { data: run } = dry
    ? { data: null }
    : await admin.from("job_run").insert({ job_name: JOB }).select("id").single();

  try {
    const messages = await buildSalesPlan(admin, forDate);

    if (dry) {
      return NextResponse.json({ dry: true, forDate, messages: [...messages.entries()] });
    }

    const { data: subs, error: subsError } = await admin
      .from("push_subscription")
      .select("id,staff_id,endpoint,p256dh,auth")
      .in("staff_id", [...messages.keys()]);
    if (subsError) throw subsError;

    let sent = 0;
    let removed = 0;
    const errors: string[] = [];
    for (const sub of (subs ?? []) as { id: string; staff_id: string; endpoint: string; p256dh: string; auth: string }[]) {
      const payload = messages.get(sub.staff_id);
      if (!payload) continue;
      const result = await sendPush(sub, payload);
      if (result === "sent") sent++;
      else if (result === "gone") {
        removed++;
        await admin.from("push_subscription").delete().eq("id", sub.id);
      } else errors.push(result.error);
    }

    const detail = { forDate, recipients: messages.size, devices: subs?.length ?? 0, sent, removed, errors };
    if (run) {
      await admin
        .from("job_run")
        .update({ finished_at: new Date().toISOString(), ok: errors.length === 0, detail })
        .eq("id", run.id);
    }
    return NextResponse.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : JSON.stringify(e);
    if (run) {
      await admin
        .from("job_run")
        .update({ finished_at: new Date().toISOString(), ok: false, detail: { forDate, error: message } })
        .eq("id", run.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
