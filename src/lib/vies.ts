import "server-only";

export interface CompanyLookup {
  name: string;
  address: string;
  postCode: string;
  city: string;
  vatId: string;
}

/**
 * Finds a company by VAT number in the EU VIES register (free, official, no key). For Slovenian numbers it
 * returns the registered name and address. A bare 8-digit number is taken as Slovenian; "HR12345678901" etc. also works.
 */
export async function lookupCompanyByVat(raw: string): Promise<{ ok: true; company: CompanyLookup } | { ok: false; error: string }> {
  const cleaned = raw.replace(/[\s.\-]/g, "").toUpperCase();
  const m = /^([A-Z]{2})?([0-9A-Z]{6,14})$/.exec(cleaned);
  if (!m) return { ok: false, error: "Davčna številka ni veljavna." };
  const country = m[1] ?? "SI";
  const number = m[2];

  let res: Response;
  try {
    res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${number}`, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Iskanje trenutno ni mogoče (register EU ne odgovarja). Podatke vpiši ročno." };
  }
  if (!res.ok) return { ok: false, error: "Iskanje trenutno ni mogoče. Podatke vpiši ročno." };

  const d = (await res.json()) as { isValid?: boolean; name?: string; address?: string };
  if (!d.isValid) return { ok: false, error: "Te davčne številke ni v registru. Preveri številko ali vpiši podatke ročno." };

  const clean = (s: string | undefined) => (s && s.trim() !== "---" ? s.replace(/\s+/g, " ").trim() : "");
  const name = clean(d.name);
  const lines = (d.address ?? "").split(/\n|,/).map((x) => x.trim()).filter((x) => x && x !== "---");
  const last = lines[lines.length - 1] ?? "";
  const pc = /^(\d{4,5})\s+(.+)$/.exec(last);
  const street = pc ? lines.slice(0, -1).join(", ") : lines.join(", ");
  return {
    ok: true,
    company: { name, address: street, postCode: pc?.[1] ?? "", city: pc?.[2] ?? "", vatId: `${country}${number}` },
  };
}
