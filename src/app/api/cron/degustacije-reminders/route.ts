import { NextResponse } from "next/server";
import { notifyBooking } from "@/lib/degustacije/people";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "Europe/Ljubljana";
const SEND_HOUR = 16;
const JOB = "degustacije-reminders";

/** Local Ljubljana wall clock for `now`: YYYY-MM-DD and hour 0-23. */
function ljubljanaNow(now = new Date()): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return { date, hour };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 16:00 (Europe/Ljubljana) the evening before: every confirmed tasting
 * tomorrow tells its presenter the group details and its kitchen person to
 * prepare the bread/food (each message goes out once). Tastings confirmed
 * later than this are handled when they are saved. Vercel cron is UTC with no
 * DST awareness, so vercel.json fires at 14:00 and 15:00 UTC and this handler
 * only acts when the Ljubljana hour is 16. Query params (secret still
 * required): force=1 skips the hour check and the already-ran guard, dry=1
 * lists what would be sent, date=YYYY-MM-DD picks the tasting day.
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
  const forDate = q.get("date") ?? addDays(now.date, 1);

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
    const { data: rows, error } = await admin.from("group_booking").select("id,group_name,arrival_time,presenter_id,kitchen_id").eq("visit_date", forDate).eq("status", "confirmed");
    if (error) throw error;
    if (dry) return NextResponse.json({ dry: true, forDate, bookings: rows });

    const sent = { presenter: 0, kitchen: 0 };
    const problems: string[] = [];
    for (const b of rows ?? []) {
      const r = await notifyBooking(admin, b.id as string);
      if (r.presenter === "sent") sent.presenter++;
      if (r.kitchen === "sent") sent.kitchen++;
      for (const state of [r.presenter, r.kitchen]) if (state === "unconfigured" || state === "no_phone" || state === "error") problems.push(`${b.group_name}: ${state}`);
      problems.push(...r.errors);
    }
    const detail = { forDate, bookings: rows?.length ?? 0, sent, problems };
    if (run) {
      await admin.from("job_run").update({ finished_at: new Date().toISOString(), ok: problems.length === 0, detail }).eq("id", run.id);
    }
    return NextResponse.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : JSON.stringify(e);
    if (run) {
      await admin.from("job_run").update({ finished_at: new Date().toISOString(), ok: false, detail: { forDate, error: message } }).eq("id", run.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
