import { createHash } from "node:crypto";
import { findCol, norm, parseAmount, parseCsv, parseDate } from "./csv";

export interface ParsedTx {
  bookedOn: string;
  amount: number; // + in, - out
  counterparty: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  purpose: string | null;
}

export interface ParsedStatement {
  format: "camt053" | "csv";
  accountIban: string | null;
  transactions: ParsedTx[];
  skipped: number;
  error?: string;
}

const dec = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
const tag = (xml: string, t: string): string | null => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${t}>`));
  return m ? dec(m[1]) : null;
};

function parseCamt(xml: string): ParsedStatement {
  const accountIban = tag(tag(xml, "Acct") ?? "", "IBAN");
  const entries = xml.match(/<(?:\w+:)?Ntry>[\s\S]*?<\/(?:\w+:)?Ntry>/g) ?? [];
  const transactions: ParsedTx[] = [];
  let skipped = 0;
  for (const e of entries) {
    const amt = parseAmount(tag(e, "Amt"));
    const out = tag(e, "CdtDbtInd") === "DBIT";
    const date = parseDate(tag(tag(e, "BookgDt") ?? "", "Dt") ?? tag(tag(e, "ValDt") ?? "", "Dt") ?? tag(tag(e, "BookgDt") ?? "", "DtTm"));
    if (amt == null || !date) {
      skipped++;
      continue;
    }
    // the other party: debtor for money in, creditor for money out
    const party = tag(e, out ? "Cdtr" : "Dbtr");
    const partyIban = tag(tag(e, out ? "CdtrAcct" : "DbtrAcct") ?? "", "IBAN");
    const refs = e.match(/<(?:\w+:)?Ref>([\s\S]*?)<\/(?:\w+:)?Ref>/);
    const ustrd = [...e.matchAll(/<(?:\w+:)?Ustrd>([\s\S]*?)<\/(?:\w+:)?Ustrd>/g)].map((x) => dec(x[1])).join(" ");
    transactions.push({
      bookedOn: date,
      amount: out ? -Math.abs(amt) : Math.abs(amt),
      counterparty: party ? tag(party, "Nm") : null,
      counterpartyIban: partyIban,
      reference: refs ? dec(refs[1]) : tag(e, "EndToEndId"),
      purpose: ustrd || tag(e, "AddtlNtryInf"),
    });
  }
  return { format: "camt053", accountIban, transactions, skipped };
}

function parseBankCsv(text: string): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length < 2) return { format: "csv", accountIban: null, transactions: [], skipped: 0, error: "Datoteka je prazna." };
  // header = first row that has a date-like and an amount-like column
  let hi = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(norm).join("|");
    if (/datum|date/.test(h) && /znesek|amount|debet|kredit|breme|dobro/.test(h)) {
      hi = i;
      break;
    }
  }
  const header = rows[hi];
  const cDate = findCol(header, ["datum knjizenja", "datum", "date", "valuta"]);
  const cAmt = findCol(header, ["znesek", "amount"]);
  const cDeb = findCol(header, ["breme", "debet", "debit"]);
  const cCred = findCol(header, ["dobro", "kredit", "credit"]);
  const cName = findCol(header, ["prejemnik", "placnik", "naziv", "partner", "ime", "counterparty", "name"]);
  const cIban = findCol(header, ["iban", "trr", "racun"]);
  const cRef = findCol(header, ["sklic", "referenca", "reference"]);
  const cPurpose = findCol(header, ["namen", "opis", "details", "purpose", "sporocilo"]);
  if (cDate < 0 || (cAmt < 0 && cDeb < 0 && cCred < 0)) {
    return { format: "csv", accountIban: null, transactions: [], skipped: 0, error: "V datoteki ne najdem stolpcev za datum in znesek." };
  }
  const transactions: ParsedTx[] = [];
  let skipped = 0;
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cDate]);
    let amount: number | null = null;
    if (cAmt >= 0) amount = parseAmount(r[cAmt]);
    if (amount == null || (amount === 0 && (cDeb >= 0 || cCred >= 0))) {
      const d = cDeb >= 0 ? parseAmount(r[cDeb]) : null;
      const c = cCred >= 0 ? parseAmount(r[cCred]) : null;
      if (c) amount = Math.abs(c);
      else if (d) amount = -Math.abs(d);
    }
    if (!date || amount == null || amount === 0) {
      skipped++;
      continue;
    }
    const iban = cIban >= 0 ? (r[cIban] ?? "").replace(/\s+/g, "").toUpperCase() : "";
    transactions.push({
      bookedOn: date,
      amount,
      counterparty: cName >= 0 ? r[cName]?.trim() || null : null,
      counterpartyIban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : null,
      reference: cRef >= 0 ? r[cRef]?.trim() || null : null,
      purpose: cPurpose >= 0 ? r[cPurpose]?.trim() || null : null,
    });
  }
  return { format: "csv", accountIban: null, transactions, skipped };
}

export function parseStatement(text: string): ParsedStatement {
  if (/<(?:\w+:)?Document[\s>]/.test(text) && /Ntry/.test(text)) return parseCamt(text);
  return parseBankCsv(text);
}

/** Stable id so uploading the same statement twice adds nothing. Identical lines inside one file get a counter. */
export function txHashes(txs: ParsedTx[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const base = [t.bookedOn, t.amount.toFixed(2), t.counterpartyIban ?? "", norm(t.counterparty ?? ""), norm(t.reference ?? ""), norm(t.purpose ?? "")].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha1").update(`${base}|${n}`).digest("hex");
  });
}

// ------------------------------------------------------------------ matching

export interface InvoiceCandidate {
  id: string;
  number: string | null;
  customerName: string;
  balance: number;
}
export interface BillCandidate {
  id: string;
  number: string | null;
  supplierName: string;
  iban: string | null;
  reference: string | null;
  amount: number;
}
export interface Suggestion {
  kind: "invoice" | "bill";
  id: string;
  score: number;
}

const alnum = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function nameScore(a: string | null, b: string): number {
  if (!a) return 0;
  const stop = new Set(["doo", "d", "o", "sp", "s", "p", "gostilna", "restavracija", "bar", "hotel", "podjetje", "kmetija"]);
  const ta = norm(a).split(" ").filter((t) => t.length > 2 && !stop.has(t));
  const tb = new Set(norm(b).split(" ").filter((t) => t.length > 2 && !stop.has(t)));
  if (ta.length === 0 || tb.size === 0) return 0;
  const hit = ta.filter((t) => tb.has(t)).length;
  return hit / Math.max(ta.length, tb.size);
}

/** Best guess for one bank line. Only a suggestion: a person confirms every match. */
export function suggestMatch(tx: ParsedTx, invoices: InvoiceCandidate[], bills: BillCandidate[]): Suggestion | null {
  const hay = alnum(`${tx.reference ?? ""} ${tx.purpose ?? ""}`);
  let best: Suggestion | null = null;
  const consider = (s: Suggestion) => {
    if (s.score >= 0.5 && (!best || s.score > best.score)) best = s;
  };

  if (tx.amount > 0) {
    for (const inv of invoices) {
      let score = 0;
      if (Math.abs(inv.balance - tx.amount) < 0.01) score += 0.5;
      const num = alnum(inv.number);
      if (num.length >= 3 && hay.includes(num)) score += 0.4;
      const ns = nameScore(tx.counterparty, inv.customerName);
      score += ns >= 0.5 ? 0.2 : 0;
      consider({ kind: "invoice", id: inv.id, score: Math.min(score, 1) });
    }
  } else if (tx.amount < 0) {
    for (const b of bills) {
      let score = 0;
      if (Math.abs(b.amount + tx.amount) < 0.01) score += 0.5;
      if (b.iban && tx.counterpartyIban && b.iban === tx.counterpartyIban) score += 0.3;
      const num = alnum(b.number);
      const ref = alnum(b.reference);
      if ((num.length >= 3 && hay.includes(num)) || (ref.length >= 4 && hay.includes(ref))) score += 0.3;
      if (nameScore(tx.counterparty, b.supplierName) >= 0.5) score += 0.2;
      consider({ kind: "bill", id: b.id, score: Math.min(score, 1) });
    }
  }
  return best;
}
