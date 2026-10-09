import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { notifyNewReply } from "@/lib/drustva/notify";
import { triageTask } from "@/lib/drustva/triage";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Instantly → Colnix. Every event is stored (idempotently, by email_id) by the
 * database function drustva_ingest_event; this route only authenticates the
 * call, answers quickly, and pushes a "new reply" notification afterwards.
 * Anything slower (AI summary and draft) happens after the response, so
 * Instantly never times out and no reply is lost.
 */
export async function POST(req: Request) {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "INSTANTLY_WEBHOOK_SECRET is not configured" }, { status: 503 });
  if (!sameSecret(req.headers.get("x-colnix-secret"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No database access" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("drustva_ingest_event", { p_event: event });
  // 500 makes Instantly retry the delivery — safe, because ingest is idempotent.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { status: string; task_id?: string | null };
  if (result.task_id) {
    after(async () => {
      try {
        await triageTask(admin, result.task_id!);
      } catch (e) {
        console.error("drustva triage failed", e);
      }
      // The person is told either way: with the summary if the AI worked, with the raw text if it did not.
      try {
        await notifyNewReply(admin, result.task_id!);
      } catch (e) {
        console.error("drustva notify failed", e);
      }
    });
  }
  return NextResponse.json(result);
}
