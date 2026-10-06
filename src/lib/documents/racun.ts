import "server-only";
import { COMPANY } from "./company";
import { PAGE, MUTED, WINE, Writer, createDoc, dateIso, eur } from "./pdf-kit";
import type { DeliveryDocData } from "./types";

/** Receipt for what was actually delivered — quantities from the signed dobavnica, prices as snapshotted on the order. */
export async function renderRacun(d: DeliveryDocData): Promise<Uint8Array> {
  const { pdf, fonts } = await createDoc();
  const w = new Writer(pdf, fonts);
  const L = PAGE.margin;
  const R = PAGE.w - PAGE.margin;

  w.text(COMPANY.name, L, { size: 13, bold: true });
  w.text("RAČUN", R, { size: 17, bold: true, color: WINE, align: "right" });
  w.down(15);
  w.text(`${COMPANY.address}, ${COMPANY.postCodeCity}`, L, { size: 8.5, color: MUTED });
  w.text(`št. ${d.invoice.number}`, R, { size: 10, bold: true, align: "right" });
  w.down(12);
  w.text(`ID za DDV: ${COMPANY.vatId}`, L, { size: 8.5, color: MUTED });
  w.text(`Datum izdaje: ${dateIso(d.invoice.issuedOn)}`, R, { align: "right" });
  w.down(12);
  w.text(`${COMPANY.email} · ${COMPANY.phone}`, L, { size: 8.5, color: MUTED });
  w.text(`Rok plačila: ${dateIso(d.invoice.dueDate)}`, R, { bold: true, align: "right" });
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
  w.text(`Dobava po naročilu št. ${d.orderNumber}, podpisana dobavnica v priponki.`, L, {
    size: 8.5,
    color: MUTED,
  });
  w.down(22);

  const col = { name: L, qty: 340, price: 430, vat: 478, total: R };
  w.text("Izdelek", col.name, { size: 8.5, bold: true, color: MUTED });
  w.text("Količina", col.qty, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("Cena", col.price, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("DDV", col.vat, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.text("Znesek", col.total, { size: 8.5, bold: true, color: MUTED, align: "right" });
  w.down(6);
  w.rule();
  w.down(14);

  for (const l of d.lines) {
    if (l.delivered === 0) continue;
    w.ensure(30);
    w.text(l.name, col.name);
    w.text(String(l.delivered), col.qty, { align: "right" });
    w.text(eur(l.unitNet), col.price, { align: "right" });
    w.text(`${Math.round(l.vatRate * 100)} %`, col.vat, { align: "right" });
    w.text(eur(l.delivered * l.unitNet * (1 - l.discountPct)), col.total, { align: "right" });
    w.down(15);
  }
  w.rule();
  w.down(16);

  const vat = d.invoice.totalGross - d.invoice.totalNet;
  for (const [label, value, bold] of [
    ["Osnova", eur(d.invoice.totalNet), false],
    ["DDV", eur(vat), false],
    ["Za plačilo", eur(d.invoice.totalGross), true],
  ] as const) {
    w.text(label, col.price - 10, { align: "right", bold, size: bold ? 12 : 9.5 });
    w.text(value, col.total, { align: "right", bold, size: bold ? 12 : 9.5 });
    w.down(bold ? 19 : 14);
  }

  w.down(14);
  w.ensure(60);
  w.text("NAČIN PLAČILA", L, { size: 8, bold: true, color: MUTED });
  w.down(13);
  w.text(`Nakazilo na ${COMPANY.iban}, sklic ${d.invoice.number}`, L);
  w.down(12);
  w.text(`Prosimo za plačilo do ${dateIso(d.invoice.dueDate)}.`, L, { color: MUTED });

  return pdf.save();
}
