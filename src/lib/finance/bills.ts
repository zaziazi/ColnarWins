import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type BillWarning =
  | { code: "duplicate"; text: string }
  | { code: "iban_changed"; text: string }
  | { code: "iban_missing"; text: string }
  | { code: "unusual_amount"; text: string }
  | { code: "new_supplier"; text: string }
  | { code: "already_due"; text: string };

export interface BillInput {
  supplierName: string;
  number?: string | null;
  issuedOn?: string | null;
  dueDate?: string | null;
  amountNet?: number | null;
  amountGross: number;
  iban?: string | null;
  reference?: string | null;
  sourceEmailId?: string | null;
  attachmentPath?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export function normalizeIban(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) ? s : null;
}

const eur = (n: number) => new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(n);

/**
 * Creates a bill from the inbox or by hand. Every bill starts waiting for a person:
 * the warnings below only decide whether it is shown as "check carefully".
 * Nothing is paid or sent to the accountant here.
 */
export async function createSupplierBill(db: Db, input: BillInput): Promise<{ id: string; warnings: BillWarning[] }> {
  const name = input.supplierName.trim().slice(0, 200) || "Neznan dobavitelj";
  const iban = normalizeIban(input.iban);
  const warnings: BillWarning[] = [];

  const { data: found } = await db.from("supplier").select("id,name,iban,typical_amount").ilike("name", name.replace(/[%_]/g, "")).limit(1);
  let supplier = (found?.[0] ?? null) as { id: string; name: string; iban: string | null; typical_amount: number | null } | null;
  if (!supplier) {
    const { data: created } = await db.from("supplier").insert({ name, iban }).select("id,name,iban,typical_amount").single();
    supplier = created as typeof supplier;
    warnings.push({ code: "new_supplier", text: "Nov dobavitelj: prvi račun preverite." });
  } else {
    if (supplier.iban && iban && supplier.iban !== iban) {
      warnings.push({ code: "iban_changed", text: `TRR se razlikuje od prejšnjega (${supplier.iban}). Preverite po telefonu, preden plačate.` });
    }
    if (!supplier.iban && iban) await db.from("supplier").update({ iban }).eq("id", supplier.id);
  }
  if (!iban && !supplier?.iban) warnings.push({ code: "iban_missing", text: "Na računu ni najti TRR." });

  if (supplier) {
    // duplicate: same supplier + same number, or same amount + same issue date
    const dupQ = db.from("supplier_bill").select("id,number,amount_gross,issued_on,status").eq("supplier_id", supplier.id).neq("status", "rejected");
    const { data: prev } = await dupQ.limit(200);
    const rows = (prev ?? []) as { id: string; number: string | null; amount_gross: number; issued_on: string | null }[];
    const dup = rows.find(
      (r) =>
        (input.number && r.number && r.number.trim().toLowerCase() === input.number.trim().toLowerCase()) ||
        (input.issuedOn && r.issued_on === input.issuedOn && Math.abs(Number(r.amount_gross) - input.amountGross) < 0.01),
    );
    if (dup) warnings.push({ code: "duplicate", text: "Videti se kot že prejet račun (isti številka ali znesek in datum)." });

    const amounts = rows.map((r) => Number(r.amount_gross)).filter((n) => n > 0);
    if (amounts.length >= 3) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      if (input.amountGross > avg * 1.6 || input.amountGross < avg * 0.4) {
        warnings.push({ code: "unusual_amount", text: `Znesek ${eur(input.amountGross)} je precej drugačen od običajnega (${eur(avg)}).` });
      }
    }
  }
  if (input.dueDate && input.dueDate < new Date().toISOString().slice(0, 10)) {
    warnings.push({ code: "already_due", text: "Rok plačila je že mimo." });
  }

  const flagged = warnings.some((w) => ["duplicate", "iban_changed", "unusual_amount"].includes(w.code));
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
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Računa ni bilo mogoče shraniti");
  return { id: data.id as string, warnings };
}
