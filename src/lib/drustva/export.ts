/**
 * Instantly import file for one wave. Instantly turns every column other than
 * its own standard ones into a custom variable, so `first_line` and
 * `type_line` can be used as {{first_line}} and {{type_line}} in the sequence.
 *
 * The sentences below are DRAFTS of the wording — edit them here before the
 * first wave goes out.
 */

const TYPE_LINES: Record<string, string> = {
  "Društvo upokojencev": "Verjamem, da vaši člani radi potujejo in odkrivajo nove kraje.",
  "Gasilsko društvo": "Gasilska društva so ponavadi povezana skupnost, ki rada skupaj preživi prosti čas.",
  "Turistično društvo": "Kot turistično društvo dobro veste, kako dragocene so lokalne zgodbe in okusi.",
  "Planinsko društvo": "Planinci radi zaključijo pohod ob dobri hrani in kozarcu domačega vina.",
  "Lovska družina": "Lovske družine imajo pogosto lepo tradicijo druženja in skupnih izletov.",
  "Zveza lovskih družin": "Verjamem, da ste povezovalec številnih družin, ki rade skupaj kam odidejo.",
  "Kulturno društvo": "Kulturna društva radi povežejo druženje z doživetjem, ki ostane v spominu.",
  "Lions klub": "Lions klubi so znani po druženju in skupnih izletih v dobro družbo.",
  "Združenje borcev": "Verjamem, da imajo vaši člani radi skupne izlete in prijetna druženja.",
  "Obrtna zbornica (OOZ)": "Obrtniki in podjetniki radi povežejo druženje z dobrim vinom in poslovnimi pogovori.",
  "Društvo invalidov": "Radi bi vam pripravili prijazen obisk, prilagojen vašim članom.",
  "Društvo podeželske mladine": "Mladi z dežele dobro vedo, kaj pomeni delo na zemlji in pridelava vina.",
  "Pevski zbor": "Pevski zbori radi skupaj praznujejo, kar ste ustvarili, ob dobrem vinu in hrani.",
  "Vinogradniško društvo": "Kot vinogradniki veste, kako dragocena je izmenjava znanja in izkušenj.",
  "Čebelarsko društvo": "Čebelarji in vinogradniki si delimo ljubezen do narave in domačih pridelkov.",
  "Krovna zveza": "Verjamem, da bi bila naša ponudba zanimiva za članska društva, ki jih povezujete.",
};
const FALLBACK_TYPE_LINE = "Verjamem, da vaše društvo rado organizira skupne izlete in druženja.";

export function typeLine(type: string | null): string {
  return (type && TYPE_LINES[type]) || FALLBACK_TYPE_LINE;
}

export function firstLine(d: { town: string | null; organizes_trips: string | null }): string {
  return d.organizes_trips === "yes"
    ? `Opazil sem, da vaše društvo${d.town ? ` iz kraja ${d.town}` : ""} organizira skupne izlete, zato vam pišem.`
    : `Pišem vam, ker bi radi povabili društva${d.town ? ` iz okolice kraja ${d.town}` : ""} na obisk naše vinske kleti.`;
}

export interface ExportRow {
  email: string;
  name: string;
  type: string | null;
  town: string | null;
  region: string | null;
  tier: string;
  distance_band: string | null;
  organizes_trips: string | null;
  wave: number | null;
}

const COLUMNS = ["email", "first_name", "company_name", "first_line", "type_line", "town", "region", "type", "tier", "distance_band", "wave"] as const;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildWaveCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.email, "", r.name, firstLine(r), typeLine(r.type), r.town, r.region, r.type, r.tier, r.distance_band, r.wave].map(cell).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM: Excel and Instantly both read the Slovenian letters correctly
}
