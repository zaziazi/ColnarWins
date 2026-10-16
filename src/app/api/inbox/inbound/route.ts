import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { ingestEmail, triagePending } from "@/lib/inbox/ingest";
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
 * Mail for the office arrives here from a small script on the office mailbox
 * (scripts/inbox-gmail-forwarder.gs) or any mail-to-webhook service.
 * Body: { message_id, from_email, from_name?, to_email?, subject?, text, received_at?,
 *         attachments?: [{ filename, content_type, data_base64 }] }.
 * Header x-colnix-secret must match INBOX_INBOUND_SECRET. Stored once per message_id;
 * the AI reading (and a phone ping for orders, complaints and urgent mail) happens after
 * the response. Claude only reads and suggests.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOX_INBOUND_SECRET;
  if (!secret) return NextResponse.json({ error: "INBOX_INBOUND_SECRET is not configured" }, { status: 503 });
  if (!sameSecret(req.headers.get("x-colnix-secret"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  const messageId = str(body.message_id, 300);
  if (!messageId) return NextResponse.json({ error: "message_id is required" }, { status: 400 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No database access" }, { status: 503 });
  }

  const attachments: { filename: string; contentType: string; content: Buffer }[] = [];
  const list = Array.isArray(body.attachments) ? (body.attachments as Record<string, unknown>[]).slice(0, 6) : [];
  for (const a of list) {
    const b64 = typeof a.data_base64 === "string" ? a.data_base64 : "";
    if (!b64) continue;
    attachments.push({
      filename: str(a.filename, 200) ?? "priloga",
      contentType: str(a.content_type, 100) ?? "application/octet-stream",
      content: Buffer.from(b64, "base64"),
    });
  }

  let result;
  try {
    result = await ingestEmail(admin, {
      messageId,
      fromEmail: str(body.from_email, 200),
      fromName: str(body.from_name, 200),
      toEmail: str(body.to_email, 200),
      subject: str(body.subject, 300),
      text: str(body.text, 30000) ?? "",
      receivedAt: str(body.received_at, 40),
      attachments,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "insert failed" }, { status: 500 }); // sender retries
  }
  if (result.status !== "stored") return NextResponse.json({ status: result.status, id: result.id });

  after(async () => {
    try {
      await triagePending(admin, { deadline: Date.now() + 55_000 });
    } catch (e) {
      console.error("inbox processing failed", e);
    }
  });
  return NextResponse.json({ status: "stored", id: result.id });
}
