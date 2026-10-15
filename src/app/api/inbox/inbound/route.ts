import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { notifyStaff } from "@/lib/notify";
import { triageInboxEmail } from "@/lib/inbox/triage";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "priloga";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

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

  const { data: existing } = await admin.from("inbox_email").select("id").eq("message_id", messageId).maybeSingle();
  if (existing) return NextResponse.json({ status: "duplicate", id: existing.id });

  const { data: row, error } = await admin
    .from("inbox_email")
    .insert({
      message_id: messageId,
      from_email: str(body.from_email, 200),
      from_name: str(body.from_name, 200),
      to_email: str(body.to_email, 200),
      subject: str(body.subject, 300),
      body_text: str(body.text, 30000) ?? "",
      received_at: str(body.received_at, 40) ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 }); // sender retries
  const id = row.id as string;

  // attachments → private bucket
  const stored: { name: string; path: string; type: string; size: number }[] = [];
  const list = Array.isArray(body.attachments) ? (body.attachments as Record<string, unknown>[]).slice(0, 6) : [];
  for (const a of list) {
    const b64 = typeof a.data_base64 === "string" ? a.data_base64 : "";
    if (!b64) continue;
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0 || buf.length > MAX_ATTACHMENT_BYTES) continue;
    const name = safeName(str(a.filename, 200) ?? "priloga");
    const type = str(a.content_type, 100) ?? "application/octet-stream";
    const path = `${id}/${stored.length}-${name}`;
    const up = await admin.storage.from("inbox-attachments").upload(path, buf, { contentType: type, upsert: true });
    if (!up.error) stored.push({ name, path, type, size: buf.length });
  }
  if (stored.length > 0) await admin.from("inbox_email").update({ attachments: stored }).eq("id", id);

  after(async () => {
    try {
      await triageInboxEmail(admin, id);
      const { data: m } = await admin.from("inbox_email").select("label,summary,from_name,from_email,extracted,status").eq("id", id).single();
      if (!m || m.status === "ignored") return;
      const urgent = Boolean((m.extracted as { urgent?: boolean } | null)?.urgent);
      if (!(urgent || m.label === "order" || m.label === "complaint")) return;
      const { data: admins } = await admin.from("staff").select("id").eq("is_admin", true);
      const who = (m.from_name as string | null) ?? (m.from_email as string | null) ?? "";
      const text = ((m.summary as string | null) ?? "Nova pošta").slice(0, 120);
      await notifyStaff(((admins ?? []) as { id: string }[]).map((s) => s.id), {
        title: `Pošta · ${m.label === "order" ? "naročilo" : m.label === "complaint" ? "pritožba" : "nujno"} · ${who}`.trim(),
        body: text,
        url: "/posta",
        tag: `inbox-${id}`,
      });
    } catch (e) {
      console.error("inbox processing failed", e);
    }
  });
  return NextResponse.json({ status: "stored", id });
}
