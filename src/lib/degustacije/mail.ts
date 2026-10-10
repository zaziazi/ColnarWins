import "server-only";
import nodemailer from "nodemailer";

/**
 * Replies to website reservation requests go out from the tastings mailbox
 * itself (DEGUSTACIJE_SMTP_HOST/PORT/USER/PASS, optional DEGUSTACIJE_MAIL_FROM),
 * separate from the delivery-documents mail settings.
 */
export function degustacijeMailConfigured(): boolean {
  return Boolean(process.env.DEGUSTACIJE_SMTP_HOST && process.env.DEGUSTACIJE_SMTP_USER && process.env.DEGUSTACIJE_SMTP_PASS);
}

export async function sendDegustacijeMail(args: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!degustacijeMailConfigured()) return { ok: false, error: "SMTP ni nastavljen" };
  try {
    const port = Number(process.env.DEGUSTACIJE_SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: process.env.DEGUSTACIJE_SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.DEGUSTACIJE_SMTP_USER, pass: process.env.DEGUSTACIJE_SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.DEGUSTACIJE_MAIL_FROM || process.env.DEGUSTACIJE_SMTP_USER,
      to: args.to,
      subject: args.subject,
      text: args.text,
      ...(args.inReplyTo ? { inReplyTo: args.inReplyTo, references: args.inReplyTo } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "napaka" };
  }
}
