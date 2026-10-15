import "server-only";
import type { DayOrder } from "@/lib/delivery-days";
import { narocila } from "@/lib/format";

/** Where print jobs go. The office worker prints whatever lands here; PRINT_MAIL_TO overrides it. */
export function printMailTo(): string {
  return process.env.PRINT_MAIL_TO?.trim() || "info@colnar.si";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateSl(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function addressOf(o: DayOrder): string {
  return [o.address, o.city].filter(Boolean).join(", ");
}

/** Flag shown at the top of an order that is being re-sent. */
function flagOf(o: DayOrder): string | null {
  if (o.changedAfterPrint) return "SPREMENJENO NAROČILO – prejšnji izpis ne velja več";
  if (o.addedAfterConfirm) return "NOVO NAROČILO – dodano po potrditvi dostave";
  return null;
}

/** Plain-text + HTML body; every order starts on its own printed page. */
export function buildPrintMail(
  day: string,
  orders: DayOrder[],
  driverLabel?: string,
): { subject: string; text: string; html: string } {
  const when = dateSl(day);
  const who = driverLabel ? ` · ${driverLabel}` : "";
  const subject =
    orders.length === 1
      ? `Za tisk: naročilo #${orders[0].orderNumber} – ${orders[0].customerName} (${when}${who})`
      : `Za tisk: dostava ${when}${who} (${narocila(orders.length)})`;

  const text = orders
    .map((o) => {
      const flag = flagOf(o);
      const head = [
        flag ?? "",
        `NAROČILO #${o.orderNumber}`,
        `Kupec: ${o.customerName}`,
        addressOf(o) ? `Naslov: ${addressOf(o)}` : "",
        o.vatId ? `Davčna številka: ${o.vatId}` : "",
        `Dostava: ${when}${o.driverName ? ` · voznik ${o.driverName}` : ""}`,
        o.deliveryNotes ? `Opomba kupca: ${o.deliveryNotes}` : "",
        o.driverNote ? `Opomba: ${o.driverNote}` : "",
      ].filter(Boolean);
      return [...head, "", ...o.lines.map((l) => `  ${String(l.quantity).padStart(4)} ×  ${l.productName}`)].join("\n");
    })
    .join("\n\n----------------------------------------\n\n");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111">` +
    orders
      .map((o, i) => {
        const flag = flagOf(o);
        return (
          `<div style="${i < orders.length - 1 ? "page-break-after:always;" : ""}padding:8px 0 24px">` +
          (flag ? `<div style="font-size:13px;font-weight:bold;color:#b00020;margin-bottom:6px">${esc(flag)}</div>` : "") +
          `<div style="font-size:12px;color:#555">Naročilo #${o.orderNumber} · dostava ${when}${o.driverName ? ` · voznik ${esc(o.driverName)}` : ""}</div>` +
          `<h1 style="font-size:26px;margin:6px 0 2px">${esc(o.customerName)}</h1>` +
          (addressOf(o) ? `<div style="font-size:15px">${esc(addressOf(o))}</div>` : "") +
          (o.vatId ? `<div style="font-size:15px">Davčna številka: ${esc(o.vatId)}</div>` : "") +
          (o.deliveryNotes ? `<div style="font-size:13px;margin-top:6px">Opomba kupca: ${esc(o.deliveryNotes)}</div>` : "") +
          (o.driverNote ? `<div style="font-size:13px;margin-top:2px">Opomba: ${esc(o.driverNote)}</div>` : "") +
          `<table style="border-collapse:collapse;margin-top:16px;width:100%;max-width:560px">` +
          `<tr><th style="text-align:left;border-bottom:2px solid #111;padding:6px 8px;font-size:13px">Izdelek</th>` +
          `<th style="text-align:right;border-bottom:2px solid #111;padding:6px 8px;font-size:13px">Količina</th></tr>` +
          o.lines
            .map(
              (l) =>
                `<tr><td style="border-bottom:1px solid #ccc;padding:8px;font-size:16px">${esc(l.productName)}</td>` +
                `<td style="border-bottom:1px solid #ccc;padding:8px;font-size:18px;font-weight:bold;text-align:right">${l.quantity}</td></tr>`,
            )
            .join("") +
          `</table></div>`
        );
      })
      .join("") +
    `</div>`;

  return { subject, text, html };
}
