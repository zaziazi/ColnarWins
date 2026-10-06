import "server-only";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
}

export type MailResult = { ok: true } | { ok: false; error: string };

/** Resend over plain fetch — one POST, no SDK needed. */
export async function sendMail(args: {
  to: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
}): Promise<MailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [args.to],
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
