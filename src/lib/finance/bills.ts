import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type BillWarning =
  | { code: "duplicate"; text: string }
  | { code: "iban_changed"; text: string }
  | { code: "iban_missing"; text: string }
  | { code: "unusual_amount"; text: string }
  | { code: "new_supplier"; text: string }
  | { code: "already_due"; text: string }
  | { code: "data_missing"; text: string };

export interface BillInput {
  supplierName: string;
  number?: string | null;
  issuedOn?: string | null;
  dueDate?: string | null;
  amountNet?: number | null;
  /** null when the figures could not be read: the bill is still filed and waits for a person. */
  amountGross: number | null;
  iban?: string | null;
  reference?: string | null;
  sourceEmailId?: string | null;
  attachmentPath?: string | null;
  archivePath?: string | null;
  fileHash?: string | null;
  fileName?: string | null;
  source?: "mail" | "upload" | "manual";
  note?: string | null;
  createdBy?: string | null;
}

export function normalizeIban(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) ? s : null;
}

const eur = (n: number) => new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(n);
const todayLjubljana = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());

interface SupplierRow {
  id: string;
  name: string;
  iban: string | null;
}

/** Finds the supplier by name (case-insensitive) or creates it. */
async function resolveSupplier(db: Db, name: string, iban: string | null): Promise<{ supplier: SupplierRow | null; created: boolean }> {
  const { data: found } = await db.from("supplier").select("id,name,iban").ilike("name", name.replace(/[%_]/g, "")).limit(1);
  const hit = (found?.[0] ?? null) as SupplierRow | null;
  if (hit) return { supplier: hit, created: false };
  const { data: created } = await db.from("supplier").insert({ name, iban }).select("id,name,iban").single();
  return { supplier: (created as SupplierRow | null) ?? null, created: true };
}

/**
 * What a person should look at before approving. Pure suggestions: nothing here blocks or pays.
 * `excludeBillId` is the bill being edited, so it does not count as its own duplicate.
 */
async function evaluate(
  db: Db,
  args: { supplier: SupplierRow | null; newSupplier: boolean; iban: string | null; number?: string | null; issuedOn?: string | null; dueDate?: string | null; amountGross: number | null; excludeBillId?: string },
): Promise<BillWarning[]> {
  const w: BillWarning[] = [];
  const { supplier, iban } = args;
  if (args.newSupplier) w.push({ code: "new_supplier", text: "Nov dobavitelj: prvi račun preverite." });
  if (args.amountGross == null || args.amountGross <= 0) {
    w.push({ code: "data_missing", text: "Podatkov z računa ni bilo mogoče prebrati. Vpišite dobavitelja, znesek in rok plačila." });
  }
  if (supplier?.iban && iban && supplier.iban !== iban) {
    w.push({ code: "iban_changed", text: `TRR se razlikuje od prejšnjega (${supplier.iban}). Preverite po telefonu, preden plačate.` });
  }
  if (!iban && !supplier?.iban) w.push({ code: "iban_missing", text: "Na računu ni najti TRR." });

  if (supplier) {
    let q = db.from("supplier_bill").select("id,number,amount_gross,issued_on").eq("supplier_id", supplier.id).neq("status", "rejected");
    if (args.excludeBillId) q = q.neq("id", args.excludeBillId);
    const { data: prev } = await q.limit(200);
    const rows = (prev ?? []) as { id: string; number: string | null; amount_gross: number | null; issued_on: string | null }[];
    const dup = rows.find(
      (r) =>
        (args.number && r.number && r.number.trim().toLowerCase() === args.number.trim().toLowerCase()) ||
        (args.issuedOn && args.amountGross != null && r.issued_on === args.issuedOn && Math.abs(Number(r.amount_gross) - args.amountGross) < 0.01),
    );
    if (dup) w.push({ code: "duplicate", text: "Videti se kot že prejet račun (ista številka ali znesek in datum)." });

    const amounts = rows.map((r) => Number(r.amount_gross)).filter((n) => n > 0);
    if (args.amountGross != null && amounts.length >= 3) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      if (args.amountGross > avg * 1.6 || args.amountGross < avg * 0.4) {
        w.push({ code: "unusual_amount", text: `Znesek ${eur(args.amountGross)} je precej drugačen od običajnega (${eur(avg)}).` });
      }
    }
  }
  if (args.dueDate && args.dueDate < todayLjubljana()) w.push({ code: "already_due", text: "Rok plačila je že mimo." });
  return w;
}

const FLAG_CODES = ["duplicate", "iban_changed", "unusual_amount", "data_missing"];

/**
 * Creates a bill from the mail, an uploaded PDF or by hand. Every bill starts waiting for a person.
 * Nothing is paid or sent anywhere here.
 */
export async function createSupplierBill(db: Db, input: BillInput): Promise<{ id: string; warnings: BillWarning[] }> {
  const name = input.supplierName.trim().slice(0, 200) || "Neznan dobavitelj";
  const iban = normalizeIban(input.iban);
  const { supplier, created } = await resolveSupplier(db, name, iban);
  if (supplier && !supplier.iban && iban && !created) await db.from("supplier").update({ iban }).eq("id", supplier.id);

  const warnings = await evaluate(db, { supplier, newSupplier: created, iban, number: input.number, issuedOn: input.issuedOn, dueDate: input.dueDate, amountGross: input.amountGross });
  const flagged = warnings.some((w) => FLAG_CODES.includes(w.code));
  const { data, error } = await db
    .from("supplier_bill")
    .insert({
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? name,
      number: input.number ?? null,
      issued_on: input.issuedOn ?? null,
      due_date: input.dueDate ?? null,
      amount_net: input.amountNet ?? null,
      amount_gross: input.amountGross,
      iban: iban ?? supplier?.iban ?? null,
      reference: input.reference ?? null,
      status: flagged ? "flagged" : "to_approve",
      warnings,
      source_email_id: input.sourceEmailId ?? null,
      attachment_path: input.attachmentPath ?? null,
      archive_path: input.archivePath ?? null,
      file_hash: input.fileHash ?? null,
      file_name: input.fileName ?? null,
      source: input.source ?? "manual",
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Računa ni bilo mogoče shraniti");
  return { id: data.id as string, warnings };
}

export interface BillPatch {
  supplierName: string;
  number: string | null;
  issuedOn: string | null;
  dueDate: string | null;
  amountNet: number | null;
  amountGross: number | null;
  iban: string | null;
  reference: string | null;
  note: string | null;
}

/** A person corrects what the AI misread; warnings are worked out again from the new figures. */
export async function updateSupplierBill(db: Db, id: string, p: BillPatch): Promise<{ warnings: BillWarning[] }> {
  const name = p.supplierName.trim().slice(0, 200) || "Neznan dobavitelj";
  const iban = normalizeIban(p.iban);
  const { supplier, created } = await resolveSupplier(db, name, iban);
  const warnings = await evaluate(db, { supplier, newSupplier: created, iban, number: p.number, issuedOn: p.issuedOn, dueDate: p.dueDate, amountGross: p.amountGross, excludeBillId: id });
  const flagged = warnings.some((w) => FLAG_CODES.includes(w.code));
  const { data: cur } = await db.from("supplier_bill").select("status").eq("id", id).single();
  const open = cur?.status === "to_approve" || cur?.status === "flagged";
  const { error } = await db
    .from("supplier_bill")
    .update({
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? name,
      number: p.number,
      issued_on: p.issuedOn,
      due_date: p.dueDate,
      amount_net: p.amountNet,
      amount_gross: p.amountGross,
      iban: iban ?? supplier?.iban ?? null,
      reference: p.reference,
      note: p.note,
      warnings,
      ...(open ? { status: flagged ? "flagged" : "to_approve" } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { warnings };
}
