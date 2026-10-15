import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { canUseFinance, canUseOfficeTools } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { mailConfigured } from "@/lib/documents/email";
import { FinanceNoAccess } from "../gate";
import { Bills, type BillRow } from "./bills";

export const dynamic = "force-dynamic";

export default async function SupplierBillsPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseOfficeTools(staff.isAdmin, staff.role) || !canUseFinance(staff.role, staff.denied)) return <FinanceNoAccess />;

  const supabase = await createClient();
  const [{ data }, { data: set }] = await Promise.all([
    supabase.from("supplier_bill").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(400),
    supabase.from("app_setting").select("value").eq("key", "accountant_email").maybeSingle(),
  ]);
  const rows: BillRow[] = ((data ?? []) as Record<string, unknown>[]).map((b) => ({
    id: b.id as string,
    supplier: b.supplier_name as string,
    number: (b.number as string | null) ?? null,
    issuedOn: (b.issued_on as string | null) ?? null,
    dueOn: (b.due_date as string | null) ?? null,
    gross: Number(b.amount_gross),
    iban: (b.iban as string | null) ?? null,
    reference: (b.reference as string | null) ?? null,
    status: b.status as BillRow["status"],
    warnings: ((b.warnings as BillRow["warnings"]) ?? []),
    attachmentPath: (b.attachment_path as string | null) ?? null,
    note: (b.note as string | null) ?? null,
    sentAt: (b.sent_to_accountant_at as string | null) ?? null,
    paidAt: (b.paid_at as string | null) ?? null,
  }));

  return (
    <AppShell
      title="Finance"
      subtitle="Računi dobaviteljev"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="finance"
      wide
    >
      <Bills rows={rows} accountantEmail={(set?.value as string | undefined) ?? ""} mailReady={mailConfigured()} />
    </AppShell>
  );
}
