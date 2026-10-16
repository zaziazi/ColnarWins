import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaff } from "@/lib/notify";
import { triageInboxEmail } from "@/lib/inbox/triage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface IncomingMail {
  messageId: string;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  text: string;
  receivedAt: string | null;
  attachments: { filename: string; contentType: string; content: Buffer }[];
  /** Newsletters and automatic mail: stored, but not sent to the AI. */
  bulk?: boolean;
  accountId?: string | null;
  imapUid?: number | null;
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 6;
const MAX_TEXT_ATTACHMENT = 60 * 1024;
const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "priloga";

/** Mail Colnix itself sends into the office mailbox (print jobs) must not come back as work. */
export function skipReason(m: Pick<IncomingMail, "subject" | "fromEmail">, ownAddress?: string | null): string | null {
  if (/^\s*(re:|fwd?:)?\s*za tisk:/i.test(m.subject ?? "")) return "Colnix: pošta za tisk";
  if (ownAddress && m.fromEmail && m.fromEmail.toLowerCase() === ownAddress.toLowerCase()) return "pošiljatelj je sam nabiralnik";
  return null;
}

/**
 * Stores one mail (once per Message-ID) and its attachments. Does not read it with AI:
 * that happens in triagePending, so a slow model never blocks the mailbox sync.
 */
export async function ingestEmail(db: Db, mail: IncomingMail, ownAddress?: string | null): Promise<{ status: "stored" | "duplicate" | "skipped"; id?: string; reason?: string }> {
  const reason = skipReason(mail, ownAddress);
  if (reason) return { status: "skipped", reason };

  const { data: existing } = await db.from("inbox_email").select("id").eq("message_id", mail.messageId).maybeSingle();
  if (existing) return { status: "duplicate", id: existing.id as string };

  // small text-like attachments (XML orders, CSV) are appended so the AI can read them
  let text = mail.text;
  for (const a of mail.attachments) {
    if (/\.(xml|csv|txt|json|edi)$/i.test(a.filename) || /^(text\/|application\/(xml|json))/.test(a.contentType)) {
      if (a.content.length <= MAX_TEXT_ATTACHMENT) text += `\n\n[priloga ${a.filename}]\n${a.content.toString("utf8")}`;
    }
  }

  const { data: row, error } = await db
    .from("inbox_email")
    .insert({
      message_id: mail.messageId.slice(0, 300),
      from_email: mail.fromEmail?.slice(0, 200) ?? null,
      from_name: mail.fromName?.slice(0, 200) ?? null,
      to_email: mail.toEmail?.slice(0, 200) ?? null,
      subject: mail.subject?.slice(0, 300) ?? null,
      body_text: text.slice(0, 60000),
      received_at: mail.receivedAt ?? new Date().toISOString(),
      account_id: mail.accountId ?? null,
      imap_uid: mail.imapUid ?? null,
      ...(mail.bulk ? { label: "newsletter", status: "ignored", skip_reason: "množično sporočilo (List-Unsubscribe)" } : {}),
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "insert failed");
  const id = row.id as string;

  const stored: { name: string; path: string; type: string; size: number }[] = [];
  for (const a of mail.attachments.slice(0, MAX_ATTACHMENTS)) {
    if (a.content.length === 0 || a.content.length > MAX_ATTACHMENT_BYTES) continue;
    const name = safeName(a.filename);
    const path = `${id}/${stored.length}-${name}`;
    const up = await db.storage.from("inbox-attachments").upload(path, a.content, { contentType: a.contentType, upsert: true });
    if (!up.error) stored.push({ name, path, type: a.contentType, size: a.content.length });
  }
  if (stored.length > 0) await db.from("inbox_email").update({ attachments: stored }).eq("id", id);
  return { status: "stored", id };
}

/** AI reading of stored mail that has not been read yet. Newest first, within a time budget. */
export async function triagePending(db: Db, opts: { deadline: number; concurrency?: number }): Promise<{ done: number; failed: number; left: number }> {
  const { data } = await db
    .from("inbox_email")
    .select("id,received_at")
    .eq("status", "new")
    .eq("label_confirmed", false)
    .lt("attempts", 3)
    .order("received_at", { ascending: false })
    .limit(60);
  const queue = ((data ?? []) as { id: string; received_at: string }[]).slice();
  let done = 0;
  let failed = 0;
  const conc = opts.concurrency ?? 3;
  const dayAgo = Date.now() - 24 * 3600_000;

  async function worker() {
    while (queue.length > 0 && Date.now() < opts.deadline - 12_000) {
      const item = queue.shift()!;
      const r = await triageInboxEmail(db, item.id);
      if (r.status === "failed") {
        failed++;
        continue;
      }
      done++;
      if (new Date(item.received_at).getTime() > dayAgo) await pingIfImportant(db, item.id);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  return { done, failed, left: queue.length };
}

/** Phone ping for the admin: new orders, complaints and urgent mail (not for old mail pulled in a backfill). */
async function pingIfImportant(db: Db, id: string): Promise<void> {
  try {
    const { data: m } = await db.from("inbox_email").select("label,summary,from_name,from_email,extracted,status").eq("id", id).single();
    if (!m || m.status === "ignored") return;
    const urgent = Boolean((m.extracted as { urgent?: boolean } | null)?.urgent);
    if (!(urgent || m.label === "order" || m.label === "complaint")) return;
    const { data: admins } = await db.from("staff").select("id").eq("is_admin", true);
    const who = (m.from_name as string | null) ?? (m.from_email as string | null) ?? "";
    await notifyStaff(((admins ?? []) as { id: string }[]).map((s) => s.id), {
      title: `Pošta · ${m.label === "order" ? "naročilo" : m.label === "complaint" ? "pritožba" : "nujno"} · ${who}`.trim(),
      body: ((m.summary as string | null) ?? "Nova pošta").slice(0, 120),
      url: "/posta",
      tag: `inbox-${id}`,
    });
  } catch {
    /* a failed ping must never break the sync */
  }
}
