/**
 * Seller identity printed on the dobavnica and receipt.
 *
 * Every value in square brackets is a placeholder until the real details
 * arrive. isCompanyConfigured() is false while any placeholder remains, and
 * the mailer refuses to send while it is — so a document with "[IBAN]" on it
 * can never go to a real customer by accident. Fill these in (and nothing
 * else needs to change) and sending switches on.
 */
export const COMPANY = {
  name: "[Ime podjetja]",
  address: "[Naslov]",
  postCodeCity: "[Poštna št. in kraj]",
  vatId: "[ID za DDV]",
  iban: "[IBAN]",
  email: "[E-naslov podjetja]",
  phone: "[Telefon]",
};

export function isCompanyConfigured(): boolean {
  return !Object.values(COMPANY).some((v) => v.includes("["));
}
