/**
 * Parses one FOSS instrument export — not standard CSV: `;`-delimited,
 * European decimal commas, a few metadata lines before the real header,
 * one measurement per file. Column names vary slightly between the
 * instrument's panels ("Malic Acid" vs "Malic acid"), so matching is
 * case-insensitive and anything not in COLUMN_FIELD is silently dropped
 * rather than treated as an error.
 */

export type ReadingValueKey =
  | "sugarGl"
  | "density"
  | "ph"
  | "so2"
  | "malicAcid"
  | "tartaricAcid"
  | "lacticAcid"
  | "totalAcid"
  | "volatileAcid"
  | "co2"
  | "alcohol"
  | "yan";

export interface ParsedReading {
  fileName: string;
  sampleId: string;
  product: string;
  /** The lot's stage inferred from Product — display/cross-check only, never written. */
  inferredStage: "grozdje" | "vrenje" | null;
  /** "YYYY-MM-DDTHH:MM:SS" — the file's own measurement time, not import time. */
  measuredAt: string;
  values: Partial<Record<ReadingValueKey, number>>;
}

export type ParseResult =
  | { ok: true; reading: ParsedReading }
  | { ok: false; fileName: string; error: string };

const PRODUCT_STAGE: Record<string, "grozdje" | "vrenje"> = {
  must: "grozdje",
  muf: "vrenje",
};

const COLUMN_FIELD: Record<string, ReadingValueKey> = {
  "reducing sugar": "sugarGl",
  density: "density",
  ph: "ph",
  so2: "so2",
  "malic acid": "malicAcid",
  "tartaric acid": "tartaricAcid",
  "lactic acid": "lacticAcid",
  "total acidity": "totalAcid",
  "volatile acidity": "volatileAcid",
  co2: "co2",
  ethanol: "alcohol",
  calculated: "yan",
};

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = parseFloat(trimmed.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

export function parseFossCsv(fileName: string, text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().toLowerCase().startsWith("date;time;id;"));
  if (headerIdx === -1) {
    return { ok: false, fileName, error: "Ni prepoznane glave (Date;Time;ID;...)." };
  }

  const headerCols = lines[headerIdx].split(";").map((c) => c.trim());
  const dataLine = lines.slice(headerIdx + 1).find((l) => l.trim() !== "");
  if (!dataLine) {
    return { ok: false, fileName, error: "Ni podatkovne vrstice." };
  }
  const cells = dataLine.split(";");

  const byCol: Record<string, string> = {};
  headerCols.forEach((col, i) => {
    byCol[col.toLowerCase()] = (cells[i] ?? "").trim();
  });

  const sampleId = byCol["id"] ?? "";
  const product = byCol["product"] ?? "";
  const dateRaw = byCol["date"] ?? "";
  const timeRaw = byCol["time"] ?? "";

  if (!sampleId) {
    return { ok: false, fileName, error: "Manjka ID vzorca." };
  }

  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateRaw);
  if (!dateMatch) {
    return { ok: false, fileName, error: `Neveljaven datum: "${dateRaw}"` };
  }
  const [, dd, mm, yyyy] = dateMatch;
  const time = /^\d{2}:\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : "00:00:00";
  const measuredAt = `${yyyy}-${mm}-${dd}T${time}`;

  const values: Partial<Record<ReadingValueKey, number>> = {};
  for (const col of headerCols) {
    const key = COLUMN_FIELD[col.toLowerCase()];
    if (!key) continue;
    const n = parseNumber(byCol[col.toLowerCase()]);
    if (n === undefined) continue;
    values[key] = key === "co2" ? n / 1000 : n; // instrument reports CO2 in mg/l, app stores g/l
  }

  return {
    ok: true,
    reading: {
      fileName,
      sampleId,
      product,
      inferredStage: PRODUCT_STAGE[product.toLowerCase()] ?? null,
      measuredAt,
      values,
    },
  };
}
