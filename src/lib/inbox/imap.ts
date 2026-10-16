import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestEmail, triagePending } from "@/lib/inbox/ingest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface MailAccount {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  pass_env: string;
  mailbox: string;
  backfill_from: string;
  uid_validity: number | null;
  last_uid: number | null;
  total_ingested: number;
}

export interface AccountReport {
  label: string;
  fetched: number;
  stored: number;
  skipped: number;
  duplicates: number;
  left: number;
  error?: string;
}

const MAX_MAIL_BYTES = 25 * 1024 * 1024;

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function isBulk(p: ParsedMail): boolean {
  if (p.headers.has("list-unsubscribe")) return true;
  const prec = String(p.headers.get("precedence") ?? "").toLowerCase();
  if (prec === "bulk" || prec === "list" || prec === "junk") return true;
  const auto = String(p.headers.get("auto-submitted") ?? "").toLowerCase();
  return auto !== "" && auto !== "no";
}

/**
 * Reads new mail of one mailbox, READ-ONLY: nothing is marked as read, moved or deleted.
 * A cursor (last UID per mailbox) remembers where we stopped; the first run starts at backfill_from.
 */
export async function pollAccount(db: Db, acc: MailAccount, opts: { maxMessages: number; deadline: number }): Promise<AccountReport> {
  const report: AccountReport = { label: acc.label, fetched: 0, stored: 0, skipped: 0, duplicates: 0, left: 0 };
  const pass = process.env[acc.pass_env];
  const fail = async (error: string) => {
    report.error = error;
    await db.from("mail_account").update({ last_checked_at: new Date().toISOString(), last_error: error.slice(0, 300) }).eq("id", acc.id);
    return report;
  };
  if (!pass) return fail(`Geslo ni nastavljeno (spremenljivka ${acc.pass_env}).`);

  const client = new ImapFlow({
    host: acc.host,
    port: acc.port,
    secure: acc.port === 993,
    auth: { user: acc.username, pass },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
  client.on("error", () => {
    /* surfaced through the awaited calls below */
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(acc.mailbox, { readOnly: true });
    try {
      const validity = Number((client.mailbox as { uidValidity?: bigint | number }).uidValidity ?? 0);
      let lastUid = acc.uid_validity === validity ? acc.last_uid : null;

      let uids: number[];
      if (lastUid == null) {
        const found = await client.search({ since: new Date(`${acc.backfill_from}T00:00:00Z`) }, { uid: true });
        uids = found || [];
      } else {
        const found = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
        uids = (found || []).filter((u) => u > (lastUid as number));
      }
      uids.sort((a, b) => a - b);
      const batch = uids.slice(0, opts.maxMessages);
      report.left = uids.length - batch.length;

      let ingested = 0;
      for (const uid of batch) {
        if (Date.now() > opts.deadline - 15_000) {
          report.left += batch.length - batch.indexOf(uid);
          break;
        }
        const head = await client.fetchOne(String(uid), { size: true }, { uid: true });
        if (head && head.size && head.size > MAX_MAIL_BYTES) {
          report.skipped++;
        } else {
          const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          if (msg && msg.source) {
            const p = await simpleParser(msg.source);
            const from = p.from?.value?.[0];
            const text = (p.text && p.text.trim()) || (typeof p.html === "string" ? htmlToText(p.html) : "");
            const r = await ingestEmail(
              db,
              {
                messageId: p.messageId || `imap-${acc.id}-${validity}-${uid}`,
                fromEmail: from?.address?.toLowerCase() ?? null,
                fromName: from?.name || null,
                toEmail: p.to ? (Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : p.to.text) : null,
                subject: p.subject ?? null,
                text,
                receivedAt: (p.date ?? (msg.internalDate instanceof Date ? msg.internalDate : new Date())).toISOString(),
                attachments: p.attachments
                  .filter((a) => a.contentDisposition === "attachment" || (a.filename && !a.related))
                  .map((a) => ({ filename: a.filename ?? "priloga", contentType: a.contentType ?? "application/octet-stream", content: a.content })),
                bulk: isBulk(p),
                accountId: acc.id,
                imapUid: uid,
              },
              acc.username,
            );
            if (r.status === "stored") {
              report.stored++;
              ingested++;
            } else if (r.status === "duplicate") report.duplicates++;
            else report.skipped++;
          }
        }
        report.fetched++;
        lastUid = uid;
        await db.from("mail_account").update({ last_uid: uid, uid_validity: validity }).eq("id", acc.id);
      }
      await db
        .from("mail_account")
        .update({
          last_checked_at: new Date().toISOString(),
          last_ok_at: new Date().toISOString(),
          last_error: null,
          uid_validity: validity,
          total_ingested: acc.total_ingested + ingested,
          ...(lastUid != null ? { last_uid: lastUid } : {}),
        })
        .eq("id", acc.id);
    } finally {
      lock.release();
    }
    await client.logout();
    return report;
  } catch (e) {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    const msg = e instanceof Error ? e.message : "napaka";
    return fail(/auth|login|credentials/i.test(msg) ? `Prijava v nabiralnik ni uspela (${msg.slice(0, 120)})` : msg);
  }
}

export interface PollSummary {
  accounts: AccountReport[];
  triage: { done: number; failed: number; left: number };
}

/** All active mailboxes, then AI reading of what arrived, within one time budget. */
export async function pollAll(db: Db, opts: { budgetMs: number; maxMessages?: number }): Promise<PollSummary> {
  const deadline = Date.now() + opts.budgetMs;
  const { data } = await db.from("mail_account").select("*").eq("active", true).order("label");
  const accounts: AccountReport[] = [];
  for (const acc of (data ?? []) as MailAccount[]) {
    if (Date.now() > deadline - 20_000) break;
    accounts.push(await pollAccount(db, acc, { maxMessages: opts.maxMessages ?? 40, deadline: Date.now() + Math.min(25_000, deadline - Date.now()) }));
  }
  const triage = await triagePending(db, { deadline });
  return { accounts, triage };
}
