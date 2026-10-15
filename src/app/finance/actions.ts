"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStaff } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { canUseFinance, canUseOfficeTools } from "@/lib/office";
import { mailConfigured, sendMail } from "@/lib/documents/email";
import { LEVEL_ORDER, LEVEL_TEXT, reminderText, type DunningLevel } from "@/lib/finance/dunning";
import { parseStatement, suggestMatch, txHashes, type BillCandidate, type InvoiceCandidate } from "@/lib/finance/bank";
import { parseInvoiceExport } from "@/lib/finance/invoice-import";
import { norm } from "@/lib/finance/csv";
import { eur } from "@/lib/format";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const Id = z.string().uuid();

async function guard() {
  const staff = await getCurrentStaff();
  return staff && canUseOfficeTools(staff.isAdmin, staff.role) && canUseFinance(staff.role, staff.denied) ? staff : null;
}

function refresh() {
  for (const p of ["/finance", "/finance/racuni", "/finance/dobavitelji", "/finance/placila", "/posta"]) revalidatePath(p);
}

const ISO = (d: Date) => d.toISOString().slice(0, 10);

// ----------------------------------------------------------------- reminders

export async function sendReminder(invoiceId: string, level: DunningLevel): Promise<Result> {
  if (!Id.safeParse(invoiceId).success || !LEVEL_ORDER.includes(level) || level === "escalated") return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  if (!mailConfigured()) return { ok: false, error: "Pošiljanje e-pošte še ni nastavljeno." };
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("v_open_invoice")
    .select("id,customer_id,invoice_number,due_date,balance_open,days_overdue,disputed")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Račun ni več odprt." };
  if (inv.disputed) return { ok: false, error: "Račun je označen kot sporen." };
  const { data: c } = await supabase.from("customer").select("name,email,dunning_paused").eq("id", inv.customer_id as string).single();
  if (!c?.email) return { ok: false, error: "Stranka nima e-naslova. Pokličite jo." };
  if (c.dunning_paused) return { ok: false, error: "Opomini za to stranko so zamrznjeni." };

  const text = reminderText({
    level,
    customer: c.name as string,
    number: inv.invoice_number as string | null,
    amount: eur(Number(inv.balance_open)),
    dueOn: inv.due_date ? new Date(`${inv.due_date}T12:00:00`).toLocaleDateString("sl-SI") : null,
  });
  const r = await sendMail({ to: c.email as string, subject: text.subject, text: text.body });
  if (!r.ok) return { ok: false, error: `Pošiljanje ni uspelo: ${r.error}` };
  await supabase.from("dunning_event").insert({
    invoice_id: inv.id,
    customer_id: inv.customer_id,
    level,
    days_overdue: inv.days_overdue,
    amount_due: inv.balance_open,
    sent_at: new Date().toISOString(),
    sent_to: c.email,
    message_body: text.body,
  });
  refresh();
  return { ok: true };
}

/** Skip (or, for a phone call, mark as done) so this level does not come back. */
export async function skipReminder(invoiceId: string, level: DunningLevel): Promise<Result> {
  if (!Id.safeParse(invoiceId).success || !LEVEL_ORDER.includes(level)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("v_open_invoice").select("id,customer_id,days_overdue,balance_open").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, error: "Račun ni več odprt." };
  const { error } = await supabase.from("dunning_event").insert({
    invoice_id: inv.id,
    customer_id: inv.customer_id,
    level,
    days_overdue: inv.days_overdue,
    amount_due: inv.balance_open,
    message_body: `${LEVEL_TEXT[level]}: preskočeno ročno`,
    suppressed: true,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setDunningPaused(customerId: string, paused: boolean): Promise<Result> {
  if (!Id.safeParse(customerId).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("customer").update({ dunning_paused: paused }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setInvoiceDisputed(invoiceId: string, disputed: boolean): Promise<Result> {
  if (!Id.safeParse(invoiceId).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("invoice").update({ disputed }).eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------- invoice import

export interface ImportReport {
  total: number;
  matched: number;
  alreadyThere: number;
  unmatched: { number: string; customer: string }[];
  sample: { number: string; customer: string; gross: number; due: string | null; paid: boolean }[];
  imported: number;
  error?: string;
}

/** Customer invoices exported from e-računi (CSV). Dry run first, then commit. Idempotent per customer + number. */
export async function importInvoices(text: string, commit: boolean): Promise<Result<{ report: ImportReport }>> {
  if (!text || text.length > 3_000_000) return { ok: false, error: "Datoteka je prazna ali prevelika." };
  if (isDemoMode) return { ok: false, error: "Demo." };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const parsed = parseInvoiceExport(text);
  if (parsed.error) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const customers: { id: string; name: string; vat_id: string | null; eracuni_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("customer").select("id,name,vat_id,eracuni_id").range(from, from + 999);
    customers.push(...((data ?? []) as typeof customers));
    if (!data || data.length < 1000) break;
  }
  const byVat = new Map<string, string>();
  const byName = new Map<string, string>();
  const byEr = new Map<string, string>();
  for (const c of customers) {
    const v = (c.vat_id ?? "").replace(/\D/g, "");
    if (v.length >= 8) byVat.set(v, c.id);
    byName.set(norm(c.name), c.id);
    if (c.eracuni_id) byEr.set(c.eracuni_id.trim(), c.id);
  }

  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("invoice").select("customer_id,invoice_number").not("invoice_number", "is", null).range(from, from + 999);
    for (const r of (data ?? []) as { customer_id: string; invoice_number: string }[]) existing.add(`${r.customer_id}|${r.invoice_number}`);
    if (!data || data.length < 1000) break;
  }

  const report: ImportReport = { total: parsed.rows.length, matched: 0, alreadyThere: 0, unmatched: [], sample: [], imported: 0 };
  const toInsert: Record<string, unknown>[] = [];
  for (const r of parsed.rows) {
    const cid =
      (r.customerEracuniId && byEr.get(r.customerEracuniId)) ||
      (r.vatId && byVat.get(r.vatId.replace(/\D/g, ""))) ||
      byName.get(norm(r.customerName)) ||
      null;
    if (!cid) {
      report.unmatched.push({ number: r.number, customer: r.customerName });
      continue;
    }
    if (existing.has(`${cid}|${r.number}`)) {
      report.alreadyThere++;
      continue;
    }
    report.matched++;
    existing.add(`${cid}|${r.number}`);
    const paid = r.paid != null && r.paid >= r.gross - 0.01;
    if (report.sample.length < 8) report.sample.push({ number: r.number, customer: r.customerName, gross: r.gross, due: r.dueOn, paid });
    toInsert.push({
      customer_id: cid,
      invoice_number: r.number,
      eracuni_invoice_id: r.eracuniId,
      issued_on: r.issuedOn ?? ISO(new Date()),
      due_date: r.dueOn ?? r.issuedOn ?? ISO(new Date()),
      total_net: r.net ?? r.gross / 1.22,
      total_gross: r.gross,
      amount_paid: Math.min(r.paid ?? 0, r.gross),
      paid_at: paid ? new Date(`${r.issuedOn ?? ISO(new Date())}T12:00:00Z`).toISOString() : null,
      source: "eracuni_import",
    });
  }
  if (commit) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const { error } = await supabase.from("invoice").insert(toInsert.slice(i, i + 200));
      if (error) return { ok: false, error: error.message };
      report.imported += Math.min(200, toInsert.length - i);
    }
    refresh();
  }
  return { ok: true, report };
}

// ----------------------------------------------------- bank statement upload

export interface StatementReport {
  format: string;
  lines: number;
  added: number;
  duplicates: number;
  suggested: number;
  skipped: number;
}

export async function uploadStatement(filename: string, text: string): Promise<Result<{ report: StatementReport }>> {
  if (!text || text.length > 4_000_000) return { ok: false, error: "Datoteka je prazna ali prevelika." };
  if (isDemoMode) return { ok: false, error: "Demo." };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const parsed = parseStatement(text);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (parsed.transactions.length === 0) return { ok: false, error: "V datoteki ni nobenega prometa." };

  const supabase = await createClient();
  const txs = parsed.transactions;
  const hashes = txHashes(txs);
  const dates = txs.map((t) => t.bookedOn).sort();

  const { data: st, error: stErr } = await supabase
    .from("bank_statement")
    .insert({ filename: filename.slice(0, 200), account_iban: parsed.accountIban, period_from: dates[0], period_to: dates[dates.length - 1], tx_count: txs.length, uploaded_by: staff.id })
    .select("id")
    .single();
  if (stErr || !st) return { ok: false, error: stErr?.message ?? "Shranjevanje ni uspelo." };

  // candidates for suggestions
  const [{ data: invs }, { data: bills }] = await Promise.all([
    supabase.from("v_open_invoice").select("id,invoice_number,balance_open,customer_id").limit(2000),
    supabase.from("supplier_bill").select("id,number,supplier_name,iban,reference,amount_gross").in("status", ["approved", "sent_to_accountant"]).limit(1000),
  ]);
  const custIds = [...new Set(((invs ?? []) as { customer_id: string }[]).map((i) => i.customer_id))];
  const names = new Map<string, string>();
  for (let i = 0; i < custIds.length; i += 200) {
    const { data } = await supabase.from("customer").select("id,name").in("id", custIds.slice(i, i + 200));
    for (const c of (data ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
  }
  const invoiceC: InvoiceCandidate[] = ((invs ?? []) as { id: string; invoice_number: string | null; balance_open: number; customer_id: string }[]).map((i) => ({
    id: i.id,
    number: i.invoice_number,
    balance: Number(i.balance_open),
    customerName: names.get(i.customer_id) ?? "",
  }));
  const billC: BillCandidate[] = ((bills ?? []) as { id: string; number: string | null; supplier_name: string; iban: string | null; reference: string | null; amount_gross: number }[]).map((b) => ({
    id: b.id,
    number: b.number,
    supplierName: b.supplier_name,
    iban: b.iban,
    reference: b.reference,
    amount: Number(b.amount_gross),
  }));

  let suggested = 0;
  const rows = txs.map((t, i) => {
    const s = suggestMatch(t, invoiceC, billC);
    if (s) suggested++;
    return {
      statement_id: st.id,
      tx_hash: hashes[i],
      booked_on: t.bookedOn,
      amount: t.amount,
      counterparty: t.counterparty,
      counterparty_iban: t.counterpartyIban,
      reference: t.reference,
      purpose: t.purpose,
      matched_kind: s?.kind ?? null,
      matched_id: s?.id ?? null,
      match_score: s?.score ?? null,
      match_status: s ? "suggested" : "unmatched",
    };
  });
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.from("bank_transaction").upsert(rows.slice(i, i + 200), { onConflict: "tx_hash", ignoreDuplicates: true }).select("id");
    if (error) return { ok: false, error: error.message };
    added += data?.length ?? 0;
  }
  await supabase.from("bank_statement").update({ tx_count: added }).eq("id", st.id);
  refresh();
  return { ok: true, report: { format: parsed.format === "camt053" ? "camt.053 (XML)" : "CSV", lines: txs.length, added, duplicates: txs.length - added, suggested, skipped: parsed.skipped } };
}

export async function confirmMatch(txId: string, kind: "invoice" | "bill", targetId: string): Promise<Result> {
  if (!Id.safeParse(txId).success || !Id.safeParse(targetId).success || !["invoice", "bill"].includes(kind)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_bank_match", { p_tx_id: txId, p_kind: kind, p_target_id: targetId });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setTxStatus(txId: string, status: "ignored" | "unmatched"): Promise<Result> {
  if (!Id.safeParse(txId).success || !["ignored", "unmatched"].includes(status)) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_transaction")
    .update({ match_status: status, matched_kind: null, matched_id: null, match_score: null })
    .eq("id", txId)
    .neq("match_status", "confirmed");
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------ supplier bills

export async function approveBill(id: string, ibanConfirmed = false): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  const staff = await guard();
  if (!staff) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data: b } = await supabase.from("supplier_bill").select("warnings,status").eq("id", id).maybeSingle();
  if (!b) return { ok: false, error: "Računa ni." };
  const w = (b.warnings as { code: string }[] | null) ?? [];
  if (w.some((x) => x.code === "iban_changed") && !ibanConfirmed) return { ok: false, error: "TRR se je spremenil. Najprej ga potrdite." };
  const { error } = await supabase
    .from("supplier_bill")
    .update({ status: "approved", approved_by: staff.id, approved_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["to_approve", "flagged"]);
  if (error) return { ok: false, error: error.message };
  // the new IBAN becomes the supplier's IBAN only after a human approved this bill
  if (w.some((x) => x.code === "iban_changed")) {
    const { data: full } = await supabase.from("supplier_bill").select("supplier_id,iban").eq("id", id).single();
    if (full?.supplier_id && full.iban) await supabase.from("supplier").update({ iban: full.iban }).eq("id", full.supplier_id);
  }
  refresh();
  return { ok: true };
}

export async function rejectBill(id: string, note: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_bill").update({ status: "rejected", note: note.trim().slice(0, 500) || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function markBillPaid(id: string): Promise<Result> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Neveljaven vnos." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { data: b } = await supabase.from("supplier_bill").select("amount_gross").eq("id", id).single();
  const { error } = await supabase
    .from("supplier_bill")
    .update({ status: "paid", paid_at: new Date().toISOString(), paid_amount: b?.amount_gross ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function saveAccountantEmail(email: string): Promise<Result> {
  const e = email.trim();
  if (!z.string().email().safeParse(e).success) return { ok: false, error: "Neveljaven e-naslov." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  const supabase = await createClient();
  const { error } = await supabase.from("app_setting").upsert({ key: "accountant_email", value: e, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** One mail to the accountant with the approved bills (PDFs attached). Nothing is paid by Colnix. */
export async function sendBillsToAccountant(ids: string[]): Promise<Result> {
  if (ids.length === 0 || ids.length > 50 || !ids.every((i) => Id.safeParse(i).success)) return { ok: false, error: "Izberite račune." };
  if (isDemoMode) return { ok: true };
  if (!(await guard())) return { ok: false, error: "Ni dostopa." };
  if (!mailConfigured()) return { ok: false, error: "Pošiljanje e-pošte še ni nastavljeno." };
  const supabase = await createClient();
  const { data: set } = await supabase.from("app_setting").select("value").eq("key", "accountant_email").maybeSingle();
  const to = set?.value as string | undefined;
  if (!to) return { ok: false, error: "Najprej vpišite e-naslov računovodje." };

  const { data: bills } = await supabase
    .from("supplier_bill")
    .select("id,supplier_name,number,issued_on,due_date,amount_gross,iban,reference,attachment_path,status")
    .in("id", ids)
    .eq("status", "approved");
  const list = (bills ?? []) as { id: string; supplier_name: string; number: string | null; issued_on: string | null; due_date: string | null; amount_gross: number; iban: string | null; reference: string | null; attachment_path: string | null }[];
  if (list.length === 0) return { ok: false, error: "Nobeden od izbranih računov ni potrjen." };

  const attachments: { filename: string; content: Uint8Array }[] = [];
  for (const b of list) {
    if (!b.attachment_path || !/\.pdf$/i.test(b.attachment_path)) continue;
    const { data: blob } = await supabase.storage.from("inbox-attachments").download(b.attachment_path);
    if (blob) attachments.push({ filename: b.attachment_path.split("/").pop() ?? "racun.pdf", content: new Uint8Array(await blob.arrayBuffer()) });
  }
  const total = list.reduce((s, b) => s + Number(b.amount_gross), 0);
  const lines = list.map(
    (b) => `• ${b.supplier_name}${b.number ? `, št. ${b.number}` : ""}: ${eur(Number(b.amount_gross))}${b.due_date ? `, rok ${new Date(`${b.due_date}T12:00:00`).toLocaleDateString("sl-SI")}` : ""}${b.iban ? `, TRR ${b.iban}` : ""}${b.reference ? `, sklic ${b.reference}` : ""}`,
  );
  const r = await sendMail({
    to,
    subject: `Računi dobaviteljev za knjiženje (${list.length})`,
    text: `Pozdravljeni,\n\nv prilogi so potrjeni računi dobaviteljev za knjiženje in plačilo:\n\n${lines.join("\n")}\n\nSkupaj: ${eur(total)}\n\nLep pozdrav,\nVinska klet Colnar`,
    attachments,
    internal: true,
  });
  if (!r.ok) return { ok: false, error: `Pošiljanje ni uspelo: ${r.error}` };
  await supabase.from("supplier_bill").update({ status: "sent_to_accountant", sent_to_accountant_at: new Date().toISOString() }).in("id", list.map((b) => b.id));
  refresh();
  return { ok: true };
}
