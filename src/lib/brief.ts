import "server-only";
import { aiConfigured, aiText } from "@/lib/ai/desk";
import { getOpenReplyTasks } from "@/lib/drustva/data";
import { getReceivablesAgeing } from "@/lib/data";
import { getDeliveryDays, todayIso } from "@/lib/delivery-days";
import { createClient } from "@/lib/supabase/server";
import { eur, narocila } from "@/lib/format";

export interface BriefItem {
  kind: "draft" | "drustvo" | "web" | "nodriver" | "unconfirmed";
  title: string;
  detail: string;
  href: string;
}

export interface Brief {
  today: string;
  numbers: {
    needs: number;
    newOrders: number;
    overdueAmount: number;
    overdueCount: number;
    deliveriesDone: number;
    deliveriesTotal: number;
  };
  items: BriefItem[];
  deliveries: { driver: string; done: number; total: number }[];
  jobs: { name: string; ok: boolean | null; at: string | null }[];
  summary: { text: string; ai: boolean; generatedAt: string | null };
}

const JOB_LABEL: Record<string, string> = {
  "driver-plan": "Načrt dostave 17:00",
  "sales-plan": "Obiski za danes 07:00",
  "sales-weekly": "Prodaja, ponedeljek",
  "drustva-daily": "Društva 07:30",
  "degustacije-reminders": "Sporočila dan prej",
};

function plus(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Facts for the morning screen, all from data Colnix already holds. */
async function collect(): Promise<Omit<Brief, "summary">> {
  const supabase = await createClient();
  const today = todayIso();
  const tomorrow = plus(today, 1);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [draftsRes, tasks, webRes, tomorrowRes, tomorrowDay, newRes, ageing, days, jobsRes] = await Promise.all([
    supabase
      .from("sales_order")
      .select("id,order_number,review_note,delivery_date,customer(name)")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(20),
    getOpenReplyTasks().catch(() => []),
    supabase
      .from("web_reservation")
      .select("id,from_name,subject,summary,status")
      .in("status", ["new", "parsed", "parse_failed"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sales_order")
      .select("id,assigned_driver_id,assigned_driver_name")
      .eq("delivery_date", tomorrow)
      .in("status", ["confirmed", "planned"]),
    supabase.from("delivery_day").select("day").eq("day", tomorrow),
    supabase.from("sales_order").select("id", { count: "exact", head: true }).gte("created_at", dayStart.toISOString()),
    getReceivablesAgeing().catch(() => []),
    getDeliveryDays().catch(() => []),
    supabase.from("job_run").select("job_name,ok,finished_at,started_at").order("started_at", { ascending: false }).limit(40),
  ]);

  const items: BriefItem[] = [];
  for (const o of (draftsRes.data ?? []) as unknown as {
    order_number: number;
    review_note: string | null;
    delivery_date: string | null;
    customer: { name: string } | null;
  }[]) {
    items.push({
      kind: "draft",
      title: o.customer?.name ?? "Naročilo",
      detail: `Osnutek #${o.order_number}${o.review_note ? `: ${o.review_note}` : " čaka potrditev"}`,
      href: "/pisarna",
    });
  }
  for (const t of tasks) {
    if (!["new", "ai_failed", "awaiting_decision"].includes(t.status)) continue;
    items.push({
      kind: "drustvo",
      title: t.drustvoName ?? "Društvo",
      detail: t.summary || t.reason || "Odgovor čaka odločitev",
      href: "/degustacije",
    });
  }
  for (const w of (webRes.data ?? []) as { from_name: string | null; subject: string | null; summary: string | null }[]) {
    items.push({
      kind: "web",
      title: w.from_name || "Spletna rezervacija",
      detail: w.summary || w.subject || "Zahteva čaka odgovor",
      href: "/degustacije",
    });
  }

  const tomorrowOrders = (tomorrowRes.data ?? []) as { assigned_driver_id: string | null; assigned_driver_name: string | null }[];
  const noDriver = tomorrowOrders.filter((o) => !o.assigned_driver_id && !o.assigned_driver_name).length;
  if (noDriver > 0) {
    items.push({
      kind: "nodriver",
      title: "Jutri brez voznika",
      detail: `${narocila(noDriver)} še nima voznika`,
      href: "/pisarna",
    });
  }
  if (tomorrowOrders.length > 0 && (tomorrowDay.data ?? []).length === 0) {
    items.push({
      kind: "unconfirmed",
      title: "Jutrišnja dostava ni potrjena",
      detail: `${narocila(tomorrowOrders.length)}; dan potrdiš v Naročilih`,
      href: "/pisarna",
    });
  }

  const overdue = ageing.filter((b) => b.bucket !== "within_terms");
  const todayDay = days.find((d) => d.date === today);
  const active = (todayDay?.orders ?? []).filter((o) => !o.cancelled);
  const isDone = (o: (typeof active)[number]) => o.lines.length > 0 && o.lines.every((l) => l.delivered);
  const byDriver = new Map<string, { driver: string; done: number; total: number }>();
  for (const o of active) {
    const k = o.driverName ?? "Brez voznika";
    const cur = byDriver.get(k) ?? { driver: k, done: 0, total: 0 };
    cur.total++;
    if (isDone(o)) cur.done++;
    byDriver.set(k, cur);
  }

  const seen = new Set<string>();
  const jobs: Brief["jobs"] = [];
  for (const j of (jobsRes.data ?? []) as { job_name: string; ok: boolean | null; finished_at: string | null; started_at: string }[]) {
    if (seen.has(j.job_name)) continue;
    seen.add(j.job_name);
    jobs.push({ name: JOB_LABEL[j.job_name] ?? j.job_name, ok: j.ok, at: j.finished_at ?? j.started_at });
  }

  return {
    today,
    numbers: {
      needs: items.length,
      newOrders: newRes.count ?? 0,
      overdueAmount: overdue.reduce((s, b) => s + b.amount, 0),
      overdueCount: overdue.reduce((s, b) => s + b.invoiceCount, 0),
      deliveriesDone: active.filter(isDone).length,
      deliveriesTotal: active.length,
    },
    items,
    deliveries: [...byDriver.values()].sort((a, b) => a.driver.localeCompare(b.driver, "sl")),
    jobs,
  };
}

/** Plain, always-available summary (used when the AI is off or fails). */
function fallbackText(f: Omit<Brief, "summary">): string {
  const n = f.numbers;
  const parts: string[] = [];
  parts.push(n.needs > 0 ? `Čaka ${n.needs} stvari, ki jih mora kdo pogledati.` : "Nič ne čaka na odločitev.");
  parts.push(`Danes je ${n.newOrders} novih naročil.`);
  if (n.deliveriesTotal > 0) parts.push(`Dostava danes: ${n.deliveriesDone} od ${n.deliveriesTotal} dostavljenih.`);
  if (n.overdueCount > 0) parts.push(`Kupci dolgujejo v zamudi ${eur(n.overdueAmount)} (${n.overdueCount} računov).`);
  return parts.join(" ");
}

export async function getBrief(opts: { force?: boolean } = {}): Promise<Brief> {
  const facts = await collect();
  const supabase = await createClient();
  const { data: cached } = await supabase.from("daily_brief").select("body,model,generated_at").eq("day", facts.today).maybeSingle();
  const fresh = cached && Date.now() - new Date(cached.generated_at as string).getTime() < 3 * 3600_000;

  if (cached && fresh && !opts.force) {
    return { ...facts, summary: { text: cached.body as string, ai: Boolean(cached.model), generatedAt: cached.generated_at as string } };
  }

  if (aiConfigured()) {
    try {
      const { text, model } = await aiText("morning_brief", {
        system:
          "You write a short morning summary in Slovenian for the manager of a small winery. " +
          "Use only the facts in the JSON. 3 to 5 plain sentences, no greeting, no lists, no invented numbers. " +
          "Mention first what needs a decision, then money, then deliveries. Write amounts as 1.234,56 €.",
        user: JSON.stringify({ numbers: facts.numbers, needs_a_human: facts.items.slice(0, 12), deliveries: facts.deliveries }),
      });
      await supabase.from("daily_brief").upsert({ day: facts.today, body: text, model, generated_at: new Date().toISOString() });
      return { ...facts, summary: { text, ai: true, generatedAt: new Date().toISOString() } };
    } catch {
      // fall through to the plain summary
    }
  }
  return { ...facts, summary: { text: fallbackText(facts), ai: false, generatedAt: null } };
}
