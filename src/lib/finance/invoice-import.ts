import { findCol, parseAmount, parseCsv, parseDate } from "./csv";

export interface ImportedInvoice {
  number: string;
  customerName: string;
  customerEracuniId: string | null;
  vatId: string | null;
  eracuniId: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  net: number | null;
  gross: number;
  paid: number | null;
}

/**
 * Tolerant reader for an invoice list exported from e-računi (CSV, ; or , separated).
 * Columns are found by name, so a different export layout usually still works.
 */
export function parseInvoiceExport(text: string): { rows: ImportedInvoice[]; error?: string } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], error: "Datoteka je prazna." };
  let hi = 0;
  for (let i = 0; i < Math.min(all.length, 10); i++) {
    if (findCol(all[i], ["stevilka", "st racuna", "invoice"]) >= 0 && findCol(all[i], ["kupec", "stranka", "naziv", "customer", "partner"]) >= 0) {
      hi = i;
      break;
    }
  }
  const h = all[hi];
  const cNum = findCol(h, ["stevilka racuna", "st racuna", "stevilka", "invoice number", "invoice no", "invoice"]);
  const cName = findCol(h, ["kupec", "stranka", "naziv partnerja", "partner", "naziv", "customer"]);
  const cVat = findCol(h, ["id za ddv", "davcna", "vat"]);
  const cEr = findCol(h, ["sifra kupca", "sifra stranke", "id kupca", "id stranke"]);
  const cIssued = findCol(h, ["datum izdaje", "datum racuna", "issued", "datum"]);
  const cDue = findCol(h, ["rok placila", "datum zapadlosti", "zapadlost", "valuta", "due"]);
  const cNet = findCol(h, ["osnova", "neto", "net"]);
  const cGross = findCol(h, ["za placilo", "znesek z ddv", "bruto", "skupaj", "gross", "znesek", "total"]);
  const cPaid = findCol(h, ["placano", "paid"]);
  const cId = findCol(h, ["interni id", "id racuna", "eracuni id"]);
  if (cNum < 0 || cName < 0 || cGross < 0) {
    return { rows: [], error: "V datoteki ne najdem stolpcev za številko računa, kupca in znesek." };
  }
  const rows: ImportedInvoice[] = [];
  for (const r of all.slice(hi + 1)) {
    const number = (r[cNum] ?? "").trim();
    const gross = parseAmount(r[cGross]);
    const customerName = (r[cName] ?? "").trim();
    if (!number || gross == null || !customerName || gross <= 0) continue;
    rows.push({
      number,
      customerName,
      customerEracuniId: cEr >= 0 ? (r[cEr] ?? "").trim() || null : null,
      vatId: cVat >= 0 ? (r[cVat] ?? "").trim() || null : null,
      eracuniId: cId >= 0 ? (r[cId] ?? "").trim() || null : null,
      issuedOn: cIssued >= 0 ? parseDate(r[cIssued]) : null,
      dueOn: cDue >= 0 ? parseDate(r[cDue]) : null,
      net: cNet >= 0 ? parseAmount(r[cNet]) : null,
      gross,
      paid: cPaid >= 0 ? parseAmount(r[cPaid]) : null,
    });
  }
  return { rows };
}
