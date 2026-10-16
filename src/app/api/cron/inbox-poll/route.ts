import { NextResponse } from "next/server";
import { pollAll } from "@/lib/inbox/imap";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reads the office mailboxes (IMAP, read-only) and lets the AI file what arrived.
 * Meant to be called every few minutes by any scheduler with `Authorization: Bearer CRON_SECRET`
 * (Vercel cron on a paid plan, cron-job.org, a cPanel cron job running curl). The daily Vercel cron
 * in vercel.json is only a safety net. Safe to call as often as you like: a cursor per mailbox
 * remembers where it stopped, and every mail is stored once.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No database access" }, { status: 503 });
  }
  const summary = await pollAll(admin, { budgetMs: 52_000 });
  return NextResponse.json(summary);
}
