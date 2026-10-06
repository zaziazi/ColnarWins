import "server-only";
import nodemailer from "nodemailer";

/**
 * Two ways to send, chosen by which credentials exist:
 *  - SMTP (SMTP_HOST + SMTP_USER + SMTP_PASS): any mailbox, incl. Gmail with
 *    an app password or the company's own mail server. No domain setup.
 *  - Resend (RESEND_API_KEY): needs a verified sending domain.
 * Both need MAIL_FROM. SMTP wins when both are set.
 */
function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function mailProvider(): "smtp" | "resend" | null {
  const from = process.env.MAIL_FROM;
  if (!from) return null;
  if (smtpConfigured()) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function mailConfigured(): boolean {
  return mailProvider() !== null;
}

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
}

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(args: {
  to: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
}): Promise<MailResult> {
  const provider = mailProvider();
  const bcc = process.env.MAIL_BCC?.trim() || undefined;
  const replyTo = process.env.MAIL_REPLY_TO?.trim() || undefined;

  try {
    if (provider === "smtp") {
      const port = Number(process.env.SMTP_PORT ?? 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from: process.env.MAIL_FROM,
        to: args.to,
        bcc,
        replyTo,
        subject: args.subject,
        text: args.text,
        attachments: args.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: "application/pdf",
        })),
      });
      return { ok: true };
    }

    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [args.to],
          bcc: bcc ? [bcc] : undefined,
          reply_to: replyTo,
          subject: args.subject,
          text: args.text,
          attachments: args.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content).toString("base64"),
          })),
        }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }

    return { ok: false, error: "Pošiljanje e-pošte ni nastavljeno." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 250) : "Pošiljanje ni uspelo." };
  }
}
