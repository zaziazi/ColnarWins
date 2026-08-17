/** Formatting helpers. Slovenian locale everywhere, one place to change it. */

export const eur = (n: number) =>
  new Intl.NumberFormat("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);

export const eurCompact = (n: number) =>
  new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 0 }).format(n) + " \u20ac";

export const dateSl = (d: string | Date) =>
  new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(typeof d === "string" ? new Date(d) : d);

export const dateShort = (d: string | Date) =>
  new Intl.DateTimeFormat("sl-SI", { weekday: "short", day: "numeric", month: "short" }).format(
    typeof d === "string" ? new Date(d) : d,
  );

/**
 * Slovenian has singular, dual, and two plural forms. Getting this wrong is
 * the fastest way to make software feel foreign, so it lives in one function.
 *   1 kupec | 2 kupca | 3-4 kupci | 5+ kupcev
 */
export function plural(n: number, one: string, two: string, few: string, many: string) {
  const r100 = n % 100;
  if (r100 === 1) return `${n} ${one}`;
  if (r100 === 2) return `${n} ${two}`;
  if (r100 === 3 || r100 === 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const kupci = (n: number) => plural(n, "kupec", "kupca", "kupci", "kupcev");
export const steklenice = (n: number) =>
  plural(n, "steklenica", "steklenici", "steklenice", "steklenic");
export const narocila = (n: number) =>
  plural(n, "naro\u010dilo", "naro\u010dili", "naro\u010dila", "naro\u010dil");

export const VAT_RATE = 0.22;

export function orderTotals(
  lines: { quantity: number; unitPriceNet: number; vatRate?: number }[],
) {
  const net = lines.reduce((s, l) => s + l.quantity * l.unitPriceNet, 0);
  const vat = lines.reduce(
    (s, l) => s + l.quantity * l.unitPriceNet * (l.vatRate ?? VAT_RATE),
    0,
  );
  return { net, vat, gross: net + vat };
}
