import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { canUseFinance } from "@/lib/office";
import { levelFor, LEVEL_ORDER, type DunningLevel } from "@/lib/finance/dunning";
import { createClient } from "@/lib/supabase/server";
import { mailConfigured } from "@/lib/documents/email";
import { FinanceNoAccess } from "../gate";
import { Invoices, type InvoiceRow } from "./invoices";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseFinance(staff.role, staff.denied)) return <FinanceNoAccess />;

  const supabase = await createClient();
  const open: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("v_open_invoice")
      .select("id,customer_id,invoice_number,issued_on,due_date,total_gross,balance_open,days_overdue,disputed")
      .order("due_date", { ascending: true })
      .range(from, from + 999);
    open.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  const custIds = [...new Set(open.map((i) => i.customer_id as string))];
  const cust = new Map<string, { name: string; email: string | null; paused: boolean; phone: string | null }>();
  for (let i = 0; i < custIds.length; i += 150) {
    const { data } = await supabase.from("customer").select("id,name,email,dunning_paused,phone").in("id", custIds.slice(i, i + 150));
    for (const c of (data ?? []) as { id: string; name: string; email: string | null; dunning_paused: boolean; phone: string | null }[]) {
      cust.set(c.id, { name: c.name, email: c.email, paused: c.dunning_paused, phone: c.phone });
    }
  }
  const events = new Map<string, { level: DunningLevel; at: string | null; suppressed: boolean }[]>();
  for (let i = 0; i < open.length; i += 150) {
    const ids = open.slice(i, i + 150).map((x) => x.id as string);
    const { data } = await supabase.from("dunning_event").select("invoice_id,level,sent_at,suppressed,created_at").in("invoice_id", ids);
    for (const e of (data ?? []) as { invoice_id: string; level: DunningLevel; sent_at: string | null; suppressed: boolean; created_at: string }[]) {
      const arr = events.get(e.invoice_id) ?? [];
      arr.push({ level: e.level, at: e.sent_at ?? e.created_at, suppressed: e.suppressed });
      events.set(e.invoice_id, arr);
    }
  }

  const rows: InvoiceRow[] = open.map((i) => {
    const c = cust.get(i.customer_id as string);
    const ev = events.get(i.id as string) ?? [];
    const lastIdx = Math.max(-1, ...ev.map((e) => LEVEL_ORDER.indexOf(e.level)));
    const due = levelFor(Number(i.days_overdue));
    const dueIdx = due ? LEVEL_ORDER.indexOf(due) : -1;
    const lastSent = ev.filter((e) => !e.suppressed).map((e) => e.at).sort().pop() ?? null;
    return {
      id: i.id as string,
      customerId: i.customer_id as string,
      customer: c?.name ?? "—",
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      paused: c?.paused ?? false,
      number: (i.invoice_number as string | null) ?? null,
      issuedOn: (i.issued_on as string | null) ?? null,
      dueOn: (i.due_date as string | null) ?? null,
      gross: Number(i.total_gross),
      balance: Number(i.balance_open),
      daysOverdue: Number(i.days_overdue),
      disputed: Boolean(i.disputed),
      nextLevel: dueIdx > lastIdx ? due : null,
      lastSentAt: lastSent,
    };
  });

  return (
    <AppShell
      title="Finance"
      subtitle="Računi kupcev"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="finance"
      wide
    >
      <Invoices rows={rows} mailReady={mailConfigured()} />
    </AppShell>
  );
}
