import { NextResponse } from "next/server";
import { runDrustvaDaily } from "@/lib/drustva/daily";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "Europe/Ljubljana";
const SEND_HOUR = 7;
const JOB = "drustva-daily";

/** Local Ljubljana wall clock for `now`: YYYY-MM-DD and hour 0-23. */
function ljubljanaNow(now = new Date()): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return { date, hour };
}

/**
 * 07:30 (Europe/Ljubljana) job for the Društva module: retries unfinished AI
 * summaries, creates today's call tasks and the visit reminders / thank-yous,
 * then pushes one morning overview. Vercel cron is UTC and has no DST
 * awareness, so vercel.json fires at both 05:30 and 06:30 UTC and this handler
 * only acts when the Ljubljana hour is 7 (duplicate tasks are blocked by a
 * unique index, so a double run is harmless). Query params (secret still required): force=1 skips the hour check and
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
    if (dry) return NextResponse.json({ dry: true, forDate });
    const detail = { forDate, ...(await runDrustvaDaily(admin, forDate)) };
    if (run) {
      await admin.from("job_run").update({ finished_at: new Date().toISOString(), ok: true, detail }).eq("id", run.id);
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
