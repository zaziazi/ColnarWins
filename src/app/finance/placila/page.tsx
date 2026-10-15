import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { canUseFinance } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { FinanceNoAccess } from "../gate";
import { Payments, type TxRow } from "./payments";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseFinance(staff.role, staff.denied)) return <FinanceNoAccess />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_transaction")
    .select("id,booked_on,amount,counterparty,reference,purpose,match_status,matched_kind,matched_id,match_score")
    .order("booked_on", { ascending: false })
    .limit(300);
  const txs = (data ?? []) as Record<string, unknown>[];

  // describe the suggested counterpart, and offer every open item for manual matching
  const [{ data: openInv }, { data: openBills }] = await Promise.all([
    supabase.from("v_open_invoice").select("id,invoice_number,balance_open,customer_id").limit(1000),
    supabase.from("supplier_bill").select("id,number,supplier_name,amount_gross,status").in("status", ["approved", "sent_to_accountant", "to_approve", "flagged"]).limit(500),
  ]);
  const custIds = [...new Set(((openInv ?? []) as { customer_id: string }[]).map((i) => i.customer_id))];
  const names = new Map<string, string>();
  for (let i = 0; i < custIds.length; i += 150) {
    const { data: cs } = await supabase.from("customer").select("id,name").in("id", custIds.slice(i, i + 150));
    for (const c of (cs ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
  }
  const invoiceOpts = ((openInv ?? []) as { id: string; invoice_number: string | null; balance_open: number; customer_id: string }[]).map((i) => ({
    id: i.id,
    label: `${names.get(i.customer_id) ?? "—"} · ${i.invoice_number ?? "brez št."}`,
    amount: Number(i.balance_open),
  }));
  const billOpts = ((openBills ?? []) as { id: string; number: string | null; supplier_name: string; amount_gross: number }[]).map((b) => ({
    id: b.id,
    label: `${b.supplier_name} · ${b.number ?? "brez št."}`,
    amount: Number(b.amount_gross),
  }));

  const rows: TxRow[] = txs.map((t) => ({
    id: t.id as string,
    bookedOn: t.booked_on as string,
    amount: Number(t.amount),
    counterparty: (t.counterparty as string | null) ?? null,
    reference: (t.reference as string | null) ?? null,
    purpose: (t.purpose as string | null) ?? null,
    status: t.match_status as TxRow["status"],
    matchedKind: (t.matched_kind as TxRow["matchedKind"]) ?? null,
    matchedId: (t.matched_id as string | null) ?? null,
    score: t.match_score != null ? Number(t.match_score) : null,
  }));

  return (
    <AppShell
      title="Finance"
      subtitle="Plačila"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="finance"
      wide
    >
      <Payments rows={rows} invoiceOpts={invoiceOpts} billOpts={billOpts} />
    </AppShell>
  );
}
