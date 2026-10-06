import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export const PAGE = { w: 595.28, h: 841.89, margin: 44 };
export const INK = rgb(0.1, 0.1, 0.1);
export const MUTED = rgb(0.42, 0.42, 0.42);
export const LINE = rgb(0.82, 0.82, 0.82);
export const WINE = rgb(0.45, 0.11, 0.17);

const FONT_DIR = path.join(process.cwd(), "src/lib/documents/fonts");

export const eur = (n: number) =>
  new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(n);

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-06" -> "06. 10. 2026" */
export function dateIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}. ${m}. ${y}`;
}

export function dateTime(d: Date): string {
  const f = new Intl.DateTimeFormat("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}. ${get("month")}. ${get("year")} ${pad(Number(get("hour")))}:${get("minute")}`;
}

export async function createDoc() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, "DejaVuSans.ttf")),
    readFile(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")),
  ]);
  const fonts = {
    regular: await pdf.embedFont(regular, { subset: true }),
    bold: await pdf.embedFont(bold, { subset: true }),
  };
  return { pdf, fonts };
}

export type Fonts = { regular: PDFFont; bold: PDFFont };

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "right";
}

/** Thin cursor-based writer so the layout code reads top to bottom. */
export class Writer {
  page: PDFPage;
  y: number;

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = pdf.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }

  text(str: string, x: number, opts: TextOpts = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const width = font.widthOfTextAtSize(str, size);
    const px = opts.align === "right" ? x - width : x;
    this.page.drawText(str, { x: px, y: this.y, size, font, color: opts.color ?? INK });
  }

  width(str: string, size = 9.5, bold = false) {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(str, size);
  }

  down(n: number) {
    this.y -= n;
  }

  rule(color = LINE) {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.w - PAGE.margin, y: this.y },
      thickness: 0.6,
      color,
    });
  }

  /** Start a new page if fewer than `need` points remain. */
  ensure(need: number) {
    if (this.y - need < PAGE.margin) {
      this.page = this.pdf.addPage([PAGE.w, PAGE.h]);
      this.y = PAGE.h - PAGE.margin;
    }
  }
}
