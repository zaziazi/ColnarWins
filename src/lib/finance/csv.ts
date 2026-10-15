/** Small tolerant CSV / number / date helpers for bank and invoice exports (Slovenian formats). */

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": (first.match(/;/g) ?? []).length, ",": (first.match(/,/g) ?? []).length, "\t": (first.match(/\t/g) ?? []).length };
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ";") as string;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "1.234,56" · "1234.56" · "-12,5 EUR" → number, or null. */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[€\s]|EUR/gi, "").replace(/ /g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^\+/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** dd.mm.yyyy · dd/mm/yyyy · yyyy-mm-dd(Thh…) → ISO date, or null. */
export function parseDate(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Index of the first header whose normalised text contains one of the needles (checked in order). */
export function findCol(header: string[], needles: string[], exclude: number[] = []): number {
  const h = header.map(norm);
  for (const n of needles) {
    const i = h.findIndex((x, idx) => !exclude.includes(idx) && x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}
