/** Wording and branding of the messages the salesperson sends. Change here, nowhere else. */

export const SALES_BRAND = "Vinarna Colnar";

/** The "I'm coming" text. Neutral wording — works whoever sends it. */
export function announceSms(opts: { repName: string; offerUrl: string }): string {
  return (
    `Pozdravljeni! Sem ${opts.repName} iz ${SALES_BRAND}. Danes sem v vaši okolici in se z veseljem oglasim – ` +
    `ob kateri uri vam ustreza? Naša ponudba vin: ${opts.offerUrl}`
  );
}

/** `sms:` links differ between iOS and Android on how the body is separated. */
export function smsHref(phone: string, body: string): string {
  const num = phone.replace(/[^\d+]/g, "");
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `sms:${num}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

export function navigateHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
