import "server-only";
import type { SimpleRoute, SimpleStop } from "@/lib/simple-routes";

/**
 * Where print jobs go. For now they land in Aljaž's own mailbox; once the
 * office worker is ready, set PRINT_MAIL_TO=info@colnar.si in Vercel.
 */
export function printMailTo(): string {
  return process.env.PRINT_MAIL_TO?.trim() || "colnar.aljaz.ac@gmail.com";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateSl(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function addressOf(s: SimpleStop): string {
  return [s.address, s.city].filter(Boolean).join(", ");
}

/** Plain-text + HTML body; every order starts on its own printed page. */
export function buildPrintMail(route: SimpleRoute, stops: SimpleStop[]): { subject: string; text: string; html: string } {
  const when = dateSl(route.date);
  const subject =
    stops.length === 1
      ? `Za tisk: naročilo #${stops[0].orderNumber} – ${stops[0].customerName} (${when})`
      : `Za tisk: dostava ${when} – ${route.vehicle} (${stops.length} naročil)`;

  const text = stops
    .map((s) => {
      const head = [
        `NAROČILO #${s.orderNumber}`,
        `Kupec: ${s.customerName}`,
        addressOf(s) ? `Naslov: ${addressOf(s)}` : "",
        `Dostava: ${when}${route.driverName ? ` · voznik ${route.driverName}` : ""}`,
        s.deliveryNotes ? `Opomba kupca: ${s.deliveryNotes}` : "",
        s.driverNote ? `Opomba: ${s.driverNote}` : "",
      ].filter(Boolean);
      return [...head, "", ...s.lines.map((l) => `  ${String(l.quantity).padStart(4)} ×  ${l.productName}`)].join("\n");
    })
    .join("\n\n----------------------------------------\n\n");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111">` +
    stops
      .map(
        (s, i) =>
          `<div style="${i < stops.length - 1 ? "page-break-after:always;" : ""}padding:8px 0 24px">` +
          `<div style="font-size:12px;color:#555">Naročilo #${s.orderNumber} · dostava ${when}${
            route.driverName ? ` · voznik ${esc(route.driverName)}` : ""
          }</div>` +
          `<h1 style="font-size:26px;margin:6px 0 2px">${esc(s.customerName)}</h1>` +
          (addressOf(s) ? `<div style="font-size:15px">${esc(addressOf(s))}</div>` : "") +
          (s.deliveryNotes ? `<div style="font-size:13px;margin-top:6px">Opomba kupca: ${esc(s.deliveryNotes)}</div>` : "") +
          (s.driverNote ? `<div style="font-size:13px;margin-top:2px">Opomba: ${esc(s.driverNote)}</div>` : "") +
          `<table style="border-collapse:collapse;margin-top:16px;width:100%;max-width:560px">` +
          `<tr><th style="text-align:left;border-bottom:2px solid #111;padding:6px 8px;font-size:13px">Izdelek</th>` +
          `<th style="text-align:right;border-bottom:2px solid #111;padding:6px 8px;font-size:13px">Količina</th></tr>` +
          s.lines
            .map(
              (l) =>
                `<tr><td style="border-bottom:1px solid #ccc;padding:8px;font-size:16px">${esc(l.productName)}</td>` +
                `<td style="border-bottom:1px solid #ccc;padding:8px;font-size:18px;font-weight:bold;text-align:right">${l.quantity}</td></tr>`,
            )
            .join("") +
          `</table></div>`,
      )
      .join("") +
    `</div>`;

  return { subject, text, html };
}
