import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface WeekBucket {
  label: string;
  from: string;
  to: string;
  inAmount: number;
  outAmount: number;
}

export interface MoneyOverview {
  receivablesTotal: number;
  receivablesOverdue: number;
  billsToApprove: { count: number; amount: number };
  billsToPay: { count: number; amount: number };
  unmatchedPayments: number;
  suggestedPayments: number;
  weeks: WeekBucket[];
  /** Everything already past its due date, not in any week. */
  overdueIn: number;
  overdueOut: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(isoDate: string, n: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Money in/out for the next four weeks from due dates of open invoices and supplier bills not yet paid. */
export async function getMoneyOverview(): Promise<MoneyOverview> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());

  const [invs, bills, unmatched, suggested] = await Promise.all([
    all<{ due_date: string; balance_open: number; disputed: boolean }>((a, b) =>
      supabase.from("v_open_invoice").select("due_date,balance_open,disputed").range(a, b),
    ),
    all<{ due_date: string | null; amount_gross: number; status: string }>((a, b) =>
      supabase.from("supplier_bill").select("due_date,amount_gross,status").in("status", ["to_approve", "flagged", "approved", "sent_to_accountant"]).range(a, b),
    ),
    supabase.from("bank_transaction").select("id", { count: "exact", head: true }).eq("match_status", "unmatched"),
    supabase.from("bank_transaction").select("id", { count: "exact", head: true }).eq("match_status", "suggested"),
  ]);

  const weeks: WeekBucket[] = [0, 1, 2, 3].map((i) => {
    const from = addDays(today, i * 7);
    const to = addDays(today, i * 7 + 6);
    return { label: i === 0 ? "Ta teden" : i === 1 ? "Naslednji teden" : `Čez ${i} tedne`, from, to, inAmount: 0, outAmount: 0 };
  });
  let overdueIn = 0;
  let overdueOut = 0;
  let receivablesTotal = 0;
  let receivablesOverdue = 0;

  for (const i of invs) {
    const amt = Number(i.balance_open);
    receivablesTotal += amt;
    if (i.due_date < today) {
      receivablesOverdue += amt;
      overdueIn += amt;
      continue;
    }
    const w = weeks.find((x) => i.due_date >= x.from && i.due_date <= x.to);
    if (w) w.inAmount += amt;
  }

  const toApprove = { count: 0, amount: 0 };
  const toPay = { count: 0, amount: 0 };
  for (const b of bills) {
    const amt = Number(b.amount_gross);
    if (b.status === "to_approve" || b.status === "flagged") {
      toApprove.count++;
      toApprove.amount += amt;
    } else {
      toPay.count++;
      toPay.amount += amt;
    }
    const due = b.due_date ?? today;
    if (due < today) {
      overdueOut += amt;
      continue;
    }
    const w = weeks.find((x) => due >= x.from && due <= x.to);
    if (w) w.outAmount += amt;
  }

  return {
    receivablesTotal,
    receivablesOverdue,
    billsToApprove: toApprove,
    billsToPay: toPay,
    unmatchedPayments: unmatched.count ?? 0,
    suggestedPayments: suggested.count ?? 0,
    weeks,
    overdueIn,
    overdueOut,
  };
}
