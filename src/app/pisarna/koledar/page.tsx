import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { getCurrentStaff } from "@/lib/data";
import { eur, lineGross } from "@/lib/format";
import { addDays, addMonths, monthStart, monthTitle, todayIso, weekStart, weekdayName } from "@/lib/sales/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: string;
  order_number: number;
  status: string;
  delivery_date: string;
  payment_method: string | null;
  paid_at: string | null;
  customer: { name: string } | { name: string }[] | null;
  order_line: Parameters<typeof lineGross>[0][];
}

/** Month overview of deliveries: how many orders and how much per day. */
export default async function OrdersCalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const staff = await getCurrentStaff();
  if (staff?.role === "sales") redirect("/dostava");

  const q = await searchParams;
  const today = todayIso();
  const month = q.m && /^\d{4}-\d{2}$/.test(q.m) ? `${q.m}-01` : monthStart(today);
  const start = weekStart(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_order")
    .select("id,order_number,status,delivery_date,payment_method,paid_at,customer(name),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,free_qty)")
    .gte("delivery_date", days[0])
    .lte("delivery_date", days[41])
    .in("status", ["draft", "confirmed", "planned", "delivered", "invoiced"])
    .order("order_number");
  const rows = (data ?? []) as unknown as OrderRow[];
  const byDay = new Map<string, OrderRow[]>();
  for (const r of rows) (byDay.get(r.delivery_date) ?? byDay.set(r.delivery_date, []).get(r.delivery_date)!).push(r);

  const gross = (r: OrderRow) => r.order_line.reduce((s, l) => s + lineGross(l), 0);
  const inMonth = rows.filter((r) => r.delivery_date.slice(0, 7) === month.slice(0, 7));
  const monthTotal = inMonth.reduce((s, r) => s + gross(r), 0);
  const name = (r: OrderRow) => (Array.isArray(r.customer) ? r.customer[0]?.name : r.customer?.name) ?? "—";

  return (
    <AppShell
      title="Koledar dostav"
      subtitle={`${monthTitle(month)} · ${inMonth.length} naročil · ${eur(monthTotal)}`}
      who={staff?.fullName ?? "Prijava potrebna"}
      role={staff?.role} seesAc={staff?.seesAc} isAdmin={staff?.isAdmin} denied={staff?.denied}
      section="narocila"
      wide
    >
      <div className="flex items-center gap-1.5 mb-3">
        <Button asChild variant="secondary" size="sm" aria-label="Prejšnji mesec">
          <Link href={`/pisarna/koledar?m=${addMonths(month, -1).slice(0, 7)}`}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm" aria-label="Naslednji mesec">
          <Link href={`/pisarna/koledar?m=${addMonths(month, 1).slice(0, 7)}`}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/pisarna/koledar">Ta mesec</Link>
        </Button>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-7 bg-surface-muted border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-subtle text-center">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="py-2">
              {weekdayName(d).slice(0, 3)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const sum = list.reduce((s, r) => s + gross(r), 0);
            const inThis = d.slice(0, 7) === month.slice(0, 7);
            return (
              <div key={d} className={cn("min-h-[84px] min-[900px]:min-h-[118px] border-t border-l border-line p-1", !inThis && "bg-surface-muted/60 text-ink-subtle")}>
                <div className="flex items-start justify-between gap-1">
                  <span className={cn("text-[12px] font-bold", d === today && "inline-grid place-items-center size-6 rounded-full bg-wine text-white")}>
                    {new Date(`${d}T12:00:00Z`).getUTCDate()}
                  </span>
                  {list.length > 0 && <span className="text-[10.5px] font-semibold text-wine tabular">{eur(sum)}</span>}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, 3).map((r) => (
                    <Link
                      key={r.id}
                      href="/pisarna"
                      className={cn(
                        "block rounded-[5px] border-l-[3px] px-1 py-0.5 text-[10.5px] leading-tight truncate bg-surface border-line-strong",
                        r.status === "draft" && "border-warn bg-warn-soft/40",
                        (r.status === "delivered" || r.status === "invoiced") && "border-good bg-good-soft/50",
                      )}
                      title={`#${r.order_number} ${name(r)}`}
                    >
                      {r.payment_method === "gotovina" && !r.paid_at ? "€ " : ""}
                      {name(r)}
                    </Link>
                  ))}
                  {list.length > 3 && <p className="text-[10.5px] text-ink-subtle px-1">+ še {list.length - 3}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11.5px] text-ink-subtle mt-2">Zeleno je dostavljeno, rumeno čaka potrditev. € pomeni gotovino ob dostavi, ki še ni plačana.</p>
    </AppShell>
  );
}
