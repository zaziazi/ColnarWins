import "server-only";
import { COMPANY } from "./company";
import { PAGE, MUTED, WINE, Writer, createDoc, dateTime, eur } from "./pdf-kit";
import type { DeliveryDocData } from "./types";

/** Signed delivery note: what was ordered vs. what actually arrived, and who took it. */
export async function renderDobavnica(d: DeliveryDocData): Promise<Uint8Array> {
  const { pdf, fonts } = await createDoc();
  const w = new Writer(pdf, fonts);
  const L = PAGE.margin;
  const R = PAGE.w - PAGE.margin;

  w.text(COMPANY.name, L, { size: 13, bold: true });
  w.text("DOBAVNICA", R, { size: 17, bold: true, color: WINE, align: "right" });
  w.down(15);
  w.text(`${COMPANY.address}, ${COMPANY.postCodeCity}`, L, { size: 8.5, color: MUTED });
  w.text(`št. naročila ${d.orderNumber}`, R, { size: 9.5, align: "right" });
  w.down(12);
  w.text(`ID za DDV: ${COMPANY.vatId}`, L, { size: 8.5, color: MUTED });
  w.text(`Dostavljeno: ${dateTime(d.signedAt)}`, R, { size: 9.5, align: "right" });
  w.down(22);
  w.rule();
  w.down(18);

  w.text("KUPEC", L, { size: 8, bold: true, color: MUTED });
  w.down(14);
  w.text(d.customer.name, L, { size: 11, bold: true });
  w.down(13);
  const addr = [d.customer.address, [d.customer.postCode, d.customer.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (addr) {
    w.text(addr, L);
    w.down(12);
  }
  if (d.customer.vatId) {
    w.text(`ID za DDV: ${d.customer.vatId}`, L, { color: MUTED });
    w.down(12);
  }
  w.down(14);

  // Table
  const col = { name: L, ordered: 330, delivered: 385, price: 458, total: R };
  w.text("Izdelek", col.name, { size: 8.5, bold: true, color: MUTED });
  w.text("Naročeno", col.ordered, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("Dostavljeno", col.delivered + 20, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("Cena", col.price, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("Znesek", col.total, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.down(6);
  w.rule();
  w.down(14);

  for (const l of d.lines) {
    w.ensure(30);
    const short = l.delivered < l.ordered;
    const amount = l.delivered * l.unitNet * (1 - l.discountPct);
    w.text(l.name, col.name, { bold: short });
    w.text(String(l.ordered), col.ordered, { align: "right" });
    w.text(String(l.delivered), col.delivered + 20, { align: "right", bold: short });
    w.text(eur(l.unitNet), col.price, { align: "right" });
    w.text(eur(amount), col.total, { align: "right" });
    w.down(15);
  }
  w.rule();
  w.down(16);

  const vat = d.invoice.totalGross - d.invoice.totalNet;
  for (const [label, value, bold] of [
    ["Osnova", eur(d.invoice.totalNet), false],
    ["DDV", eur(vat), false],
    ["Skupaj", eur(d.invoice.totalGross), true],
  ] as const) {
    w.text(label, col.price - 40, { align: "right", bold, size: bold ? 11 : 9.5 });
    w.text(value, col.total, { align: "right", bold, size: bold ? 11 : 9.5 });
    w.down(bold ? 17 : 14);
  }

  if (d.note) {
    w.down(6);
    w.ensure(40);
    w.text("OPOMBA", L, { size: 8, bold: true, color: MUTED });
    w.down(13);
    w.text(d.note.slice(0, 160), L);
    w.down(14);
  }

  // Signature block
  w.down(14);
  w.ensure(130);
  w.text("BLAGO PREVZEL/A", L, { size: 8, bold: true, color: MUTED });
  w.down(8);
  if (d.signaturePng) {
    const img = await pdf.embedPng(d.signaturePng);
    const h = 70;
    const wd = Math.min(220, (img.width / img.height) * h);
    w.page.drawImage(img, { x: L, y: w.y - h, width: wd, height: h });
    w.down(h + 10);
  } else {
    w.down(20);
  }
  w.rule();
  w.down(13);
  w.text(`${d.signerName} · ${dateTime(d.signedAt)}`, L);
  w.down(12);
  w.text(`Potrdilo: ${d.proofHash.slice(0, 16)}`, L, { size: 7.5, color: MUTED });

  return pdf.save();
}
