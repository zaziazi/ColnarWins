import "server-only";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  customer: "Stranka",
  sales_order: "Naročilo",
  order_line: "Postavka naročila",
  product: "Izdelek",
  product_stock: "Zaloga",
  stock_movement: "Gibanje zaloge",
  route: "Pot",
  route_stop: "Postanek poti",
  delivery_day: "Dan dostave",
  delivery_proof: "Dokaz dostave",
  invoice: "Račun",
  payment: "Plačilo",
  standing_order: "Stalno naročilo",
  standing_order_line: "Postavka stalnega naročila",
  staff: "Uporabnik",
  venue: "Lokal",
  visit: "Obisk",
  prospect: "Potencialna stranka",
  sample: "Vzorec",
  target: "Cilj",
  group_booking: "Degustacija",
  degustacija_person: "Oseba (degustacije)",
  drustvo_settings: "Nastavitve degustacij",
  drustvo: "Društvo",
  drustvo_reply_task: "Odgovor društvu",
  vessel: "Rezervoar",
  wine_lot: "Vino v kleti",
  wine_lot_event: "Dogodek v kleti",
  rep_stock_movement: "Vino v avtu",
};

export const AUDIT_FIELD_LABEL: Record<string, string> = {
  quantity_ordered: "naročeno",
  quantity_delivered: "dostavljeno",
  quantity_on_hand: "zaloga",
  quantity_delta: "sprememba količine",
  quantity: "količina",
  delivery_date: "datum dostave",
  status: "status",
  driver_note: "opomba za voznika",
  assigned_driver_id: "voznik",
  assigned_driver_name: "voznik (ročno)",
  customer_id: "kupec",
  product_id: "izdelek",
  role: "vloga",
  active: "aktiven",
  phone: "telefon",
  email: "e-pošta",
  name: "ime",
  full_name: "ime",
  username: "uporabniško ime",
  unit_price_net: "cena (neto)",
  vat_rate: "DDV",
  address: "naslov",
  city: "kraj",
  post_code: "pošta",
  note: "opomba",
  notes: "opombe",
  volume_l: "prostornina (l)",
  print_sent_at: "poslano v tisk",
  print_dismissed_at: "odstranjeno iz tiska",
  is_admin: "skrbnik",
  sees_ac: "vidi Naročila AC",
  delivers: "dostavlja",
  movement_type: "vrsta",
  payment_method: "način plačila",
  invoice_number: "št. računa",
  invoice_waived: "brez računa",
  invoice_waived_note: "razlog (brez računa)",
  paid_at: "plačano",
  paid_amount: "plačan znesek",
  free_qty: "gratis (kos)",
  discount_pct: "popust",
  kind: "vrsta stranke",
  first_name: "ime",
  last_name: "priimek",
  location: "lokacija",
  tasting_price_eur: "cena na osebo",
  tasting_fee_eur: "prihodek degustacije",
  other_income_eur: "drugi prihodki",
  income_payment_method: "način plačila (degustacija)",
  income_paid_at: "plačano (degustacija)",
  income_note: "opomba (prihodek)",
  stage: "faza",
  presenter_id: "voditelj",
  kitchen_id: "hrana",
  visit_date: "datum",
  arrival_time: "ura",
  people_planned: "število oseb",
  credit_hold: "blokada kredita",
  confirmed_at: "potrjeno",
  cancelled_at: "preklicano",
  delivered_at: "dostavljeno ob",
  customer_id_link: "kupec",
};

/** Columns that only add noise to a human reading the log. */
const HIDDEN = new Set([
  "id", "print_hash", "instance_id", "auth_user_id", "created_by", "confirmed_by", "source_email_text", "source_email_id",
  "order_id", "line_total_net", "dunning_paused", "einvoice_channel", "payment_terms_days",
  "order_number", "source", "route_id", "sequence",
]);

export interface AuditEntry {
  id: number;
  at: string;
  actorName: string;
  table: string;
  tableLabel: string;
  label: string | null;
  action: "insert" | "update" | "delete";
  /** Pre-formatted lines: "polje: staro → novo" for updates, "polje: vrednost" otherwise. */
  lines: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditPage {
  entries: AuditEntry[];
  hasMore: boolean;
  actors: string[];
}

const PAGE = 100;

export async function getAuditLog(opts: { table?: string; actor?: string; page?: number }): Promise<AuditPage> {
  if (isDemoMode) return { entries: [], hasMore: false, actors: [] };
  const supabase = await createClient();
  const page = Math.max(0, opts.page ?? 0);

  let q = supabase
    .from("audit_log")
    .select("id,at,actor_name,table_name,label,action,changes")
    .order("id", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE); // one extra row tells us whether there is a next page
  if (opts.table) q = q.eq("table_name", opts.table);
  if (opts.actor) q = q.eq("actor_name", opts.actor);

  const [{ data, error }, actorsRes] = await Promise.all([
    q,
    supabase.from("audit_log").select("actor_name").order("id", { ascending: false }).limit(2000),
  ]);
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);

  // Replace ids by names (people, products, customers) so the log reads like a sentence.
  const ids = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === "string" && UUID.test(v)) ids.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  for (const r of shown) Object.values((r.changes ?? {}) as Record<string, unknown>).forEach(collect);

  const names = new Map<string, string>();
  if (ids.size > 0) {
    const list = [...ids];
    const [staff, products, customers] = await Promise.all([
      supabase.from("staff").select("id,full_name").in("id", list),
      supabase.from("product").select("id,name").in("id", list),
      supabase.from("customer").select("id,name").in("id", list),
    ]);
    for (const s of staff.data ?? []) names.set(s.id as string, s.full_name as string);
    for (const p of products.data ?? []) names.set(p.id as string, p.name as string);
    for (const c of customers.data ?? []) names.set(c.id as string, c.name as string);
  }

  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "da" : "ne";
    if (typeof v === "string" && UUID.test(v)) return names.get(v) ?? v.slice(0, 8);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      return new Intl.DateTimeFormat("sl-SI", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const entries: AuditEntry[] = shown.map((r) => {
    const changes = (r.changes ?? {}) as Record<string, unknown>;
    const lines: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
      if (HIDDEN.has(key)) continue;
      const label = AUDIT_FIELD_LABEL[key] ?? key;
      if (r.action === "update" && Array.isArray(value)) {
        lines.push(`${label}: ${fmt(value[0])} → ${fmt(value[1])}`);
      } else if (r.action !== "update") {
        lines.push(`${label}: ${fmt(value)}`);
      }
    }
    return {
      id: r.id as number,
      at: r.at as string,
      actorName: r.actor_name as string,
      table: r.table_name as string,
      tableLabel: AUDIT_TABLE_LABEL[r.table_name as string] ?? (r.table_name as string),
      label: (r.label as string | null) ?? null,
      action: r.action as AuditEntry["action"],
      lines: lines.slice(0, 8),
    };
  });

  const actors = [...new Set((actorsRes.data ?? []).map((a) => a.actor_name as string))].sort((a, b) => a.localeCompare(b, "sl"));
  return { entries, hasMore, actors };
}
