"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, TriangleAlert, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/lib/finance/csv";
import { createClient } from "@/lib/supabase/client";
import { addSupplierBill } from "@/app/posta/actions";
import { approveBill, billFileUrl, fileUploadedInvoice, markBillPaid, rejectBill, saveAccountantEmail, sendBillsToAccountant, updateBill, type FiledReport } from "../actions";

export interface BillRow {
  id: string;
  supplier: string;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  gross: number | null;
  net: number | null;
  iban: string | null;
  reference: string | null;
  status: "to_approve" | "flagged" | "approved" | "sent_to_accountant" | "paid" | "rejected";
  warnings: { code: string; text: string }[];
  hasFile: boolean;
  fileName: string | null;
  source: "mail" | "upload" | "manual";
  receivedOn: string | null;
  note: string | null;
  sentAt: string | null;
  paidAt: string | null;
}

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("sl-SI") : "—");
const money = (n: number | null) => (n == null ? "znesek ni vpisan" : eur(n));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date());
const daysBetween = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso}T12:00:00Z`).getTime() - new Date(`${fromIso}T12:00:00Z`).getTime()) / 86400000);

const STATUS: Record<BillRow["status"], { text: string; tone: "neutral" | "warn" | "good" | "danger" | "info" }> = {
  to_approve: { text: "Čaka potrditev", tone: "warn" },
  flagged: { text: "Preverite", tone: "danger" },
  approved: { text: "Potrjen", tone: "info" },
  sent_to_accountant: { text: "Poslan računovodji", tone: "good" },
  paid: { text: "Plačan", tone: "good" },
  rejected: { text: "Zavrnjen", tone: "neutral" },
};
const SOURCE_TEXT: Record<BillRow["source"], string> = { mail: "iz pošte", upload: "naloženo", manual: "ročno" };
const UNPAID: BillRow["status"][] = ["to_approve", "flagged", "approved", "sent_to_accountant"];

/** "rok 4. 11. · čez 20 dni" with a colour that says how urgent it is. */
function DueLine({ b }: { b: BillRow }) {
  if (!b.dueOn) return <span className="text-ink-subtle">rok plačila ni vpisan</span>;
  if (!UNPAID.includes(b.status)) return <span>rok {day(b.dueOn)}</span>;
  const d = daysBetween(today(), b.dueOn);
  const tone = d < 0 ? "text-danger" : d <= 7 ? "text-warn" : "text-ink-muted";
  const text = d < 0 ? `zamuda ${-d} ${-d === 1 ? "dan" : "dni"}` : d === 0 ? "rok je danes" : d === 1 ? "rok je jutri" : `čez ${d} dni`;
  return (
    <span>
      rok {day(b.dueOn)} · <span className={cn("font-semibold", tone)}>{text}</span>
    </span>
  );
}

type Tab = "todo" | "approved" | "arhiv" | "stroski";

export function Bills({ rows, accountantEmail, mailReady }: { rows: BillRow[]; accountantEmail: string; mailReady: boolean }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [tab, setTab] = React.useState<Tab>("todo");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [email, setEmail] = React.useState(accountantEmail);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);

  const todo = rows.filter((r) => r.status === "to_approve" || r.status === "flagged");
  const approved = rows.filter((r) => r.status === "approved" || r.status === "sent_to_accountant");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Napaka");
      else router.refresh();
    });
  }
  async function openFile(id: string) {
    const r = await billFileUrl(id);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else toast.error(r.error);
  }
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sendable = [...picked].filter((id) => rows.find((r) => r.id === id)?.status === "approved");

  const list = tab === "todo" ? todo : approved;

  return (
    <div className="space-y-3">
      <UploadPanel onDone={() => router.refresh()} />

      <div className="flex flex-wrap items-center gap-2">
        {([["todo", `Za potrditev (${todo.length})`], ["approved", `Potrjeni (${approved.length})`], ["arhiv", `Arhiv (${rows.length})`], ["stroski", "Stroški in roki"]] as const).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border", tab === k ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}
          >
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          Dodaj račun ročno
        </Button>
      </div>

      {adding && <AddBill onDone={() => { setAdding(false); router.refresh(); }} />}

      {tab === "arhiv" && <Archive rows={rows} onOpen={openFile} />}
      {tab === "stroski" && <Costs rows={rows} />}

      {tab === "approved" && (
        <Card className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow max-w-sm">
              <label className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">E-naslov računovodje</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="racunovodja@podjetje.si" />
            </div>
            <Button size="sm" variant="secondary" loading={busy} disabled={email === accountantEmail || !email} onClick={() => run(() => saveAccountantEmail(email))}>
              Shrani
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={sendable.length === 0 || !accountantEmail || !mailReady}
              onClick={() => {
                if (!window.confirm(`Pošljem ${sendable.length} računov računovodji (${accountantEmail})?`)) return;
                run(async () => {
                  const r = await sendBillsToAccountant(sendable);
                  if (r.ok) setPicked(new Set());
                  return r;
                });
              }}
            >
              Pošlji izbrane računovodji ({sendable.length})
            </Button>
          </div>
          <p className="text-[11.5px] text-ink-subtle">Colnix ne plačuje: računovodji pošlje potrjene račune s priponkami, plačilo opravite v banki.</p>
        </Card>
      )}

      {(tab === "todo" || tab === "approved") &&
        (list.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[13.5px] text-ink-muted">
              {tab === "todo" ? "Ni računov, ki bi čakali na potrditev. Naložite PDF zgoraj ali počakajte na pošto." : "Ni računov."}
            </p>
          </Card>
        ) : (
          list.map((b) => {
            const st = STATUS[b.status];
            const ibanChanged = b.warnings.some((w) => w.code === "iban_changed");
            const isEditing = editing === b.id;
            return (
              <Card key={b.id} className={cn("p-3.5", b.status === "flagged" && "border-danger")}>
                <div className="flex flex-wrap items-start gap-3">
                  {tab === "approved" && b.status === "approved" && (
                    <input type="checkbox" className="mt-1.5" checked={picked.has(b.id)} onChange={() => toggle(b.id)} aria-label="Izberi račun" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[15px]">{b.supplier}</p>
                      <Badge tone={st.tone}>{st.text}</Badge>
                      <span className="text-[11px] text-ink-subtle">{SOURCE_TEXT[b.source]}</span>
                    </div>
                    <p className="text-[12.5px] text-ink-muted mt-0.5">
                      {b.number ? `Št. ${b.number} · ` : ""}izdan {day(b.issuedOn)} · <DueLine b={b} />
                    </p>
                    <p className="text-[14px] font-semibold tabular mt-0.5">{money(b.gross)}</p>
                    <p className="text-[11.5px] text-ink-subtle mt-0.5">
                      {b.iban ?? "TRR ni znan"}
                      {b.reference ? ` · sklic ${b.reference}` : ""}
                      {b.sentAt ? ` · poslan ${day(b.sentAt)}` : ""}
                      {b.paidAt ? ` · plačan ${day(b.paidAt)}` : ""}
                    </p>
                    {b.note && <p className="text-[12px] text-ink-muted mt-1">Opomba: {b.note}</p>}
                    {b.warnings
                      .filter((w) => w.code !== "already_due" || b.status === "to_approve")
                      .map((w, i) => (
                        <p key={i} className={cn("flex items-start gap-1.5 text-[12.5px] mt-1.5", ["duplicate", "iban_changed", "unusual_amount", "data_missing"].includes(w.code) ? "text-danger" : "text-warn")}>
                          <TriangleAlert className="size-3.5 mt-0.5 shrink-0" /> {w.text}
                        </p>
                      ))}
                  </div>
                  {b.hasFile && (
                    <button type="button" onClick={() => openFile(b.id)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-wine underline underline-offset-2">
                      <FileText className="size-3.5" /> Odpri račun
                    </button>
                  )}
                </div>

                {isEditing && <EditBill b={b} onDone={() => { setEditing(null); router.refresh(); }} />}

                <div className="flex flex-wrap gap-2 mt-3">
                  {(b.status === "to_approve" || b.status === "flagged") && (
                    <>
                      <Button
                        size="sm"
                        loading={busy}
                        disabled={b.gross == null}
                        onClick={() => {
                          if (ibanChanged && !window.confirm("TRR se razlikuje od prejšnjega. Ste preverili po telefonu, da je nov TRR pravi?")) return;
                          run(() => approveBill(b.id, ibanChanged));
                        }}
                      >
                        Potrdi
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(isEditing ? null : b.id)}>
                        {isEditing ? "Zapri urejanje" : "Uredi podatke"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy}
                        onClick={() => {
                          const note = window.prompt("Zakaj zavrnete račun? (neobvezno)") ?? null;
                          if (note === null) return;
                          run(() => rejectBill(b.id, note));
                        }}
                      >
                        Zavrni
                      </Button>
                    </>
                  )}
                  {(b.status === "approved" || b.status === "sent_to_accountant") && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(isEditing ? null : b.id)}>
                        {isEditing ? "Zapri urejanje" : "Uredi podatke"}
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => markBillPaid(b.id))}>
                        Označi kot plačano
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })
        ))}
    </div>
  );
}

// ------------------------------------------------------------------ upload

function UploadPanel({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<FiledReport[]>([]);
  const input = React.useRef<HTMLInputElement>(null);

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setResults([]);
    const supabase = createClient();
    const out: FiledReport[] = [];
    for (const f of Array.from(files)) {
      if (!/\.(pdf|png|jpe?g)$/i.test(f.name) && !/^(application\/pdf|image\/)/.test(f.type)) {
        out.push({ name: f.name, outcome: "error", error: "Samo PDF ali slika." });
        continue;
      }
      if (f.size > 6 * 1024 * 1024) {
        out.push({ name: f.name, outcome: "error", error: "Datoteka je večja od 6 MB." });
        continue;
      }
      const ext = (f.name.match(/\.(pdf|png|jpe?g)$/i)?.[1] ?? "pdf").toLowerCase();
      const path = `incoming/${crypto.randomUUID()}.${ext}`;
      const type = f.type || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);
      const up = await supabase.storage.from("invoice-archive").upload(path, f, { contentType: type, upsert: false });
      if (up.error) {
        out.push({ name: f.name, outcome: "error", error: up.error.message });
        continue;
      }
      const r = await fileUploadedInvoice(path, f.name, type);
      out.push(r.ok ? r.report : { name: f.name, outcome: "error", error: r.error });
      setResults([...out]);
    }
    setResults(out);
    setBusy(false);
    if (input.current) input.current.value = "";
    onDone();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold flex items-center gap-2">
            <Upload className="size-4" /> Naloži račune v arhiv
          </p>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            PDF ali fotografija računa. Shranjen je trajno, podatki so prebrani, vi samo potrdite. Isti račun ne pride dvakrat v arhiv.
          </p>
        </div>
        <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => void handle(e.target.files)} />
        <Button size="sm" loading={busy} onClick={() => input.current?.click()}>
          Izberi datoteke
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12.5px]">
          {results.map((r, i) => (
            <li key={i} className={r.outcome === "error" ? "text-danger" : r.outcome === "duplicate" ? "text-warn" : "text-ink-muted"}>
              <b>{r.name}</b>:{" "}
              {r.outcome === "filed"
                ? `v arhivu${r.supplier ? ` · ${r.supplier}` : ""}${r.read ? "" : " · podatkov ni bilo mogoče prebrati, vpišite jih"}`
                : r.outcome === "duplicate"
                  ? `že v arhivu${r.supplier ? ` (${r.supplier})` : ""}`
                  : r.error}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------- archive

function Archive({ rows, onOpen }: { rows: BillRow[]; onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | BillRow["status"]>("all");
  const [month, setMonth] = React.useState("all");
  const months = [...new Set(rows.map((r) => (r.issuedOn ?? r.receivedOn ?? "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const list = rows
    .filter((r) => (status === "all" || r.status === status) && (month === "all" || (r.issuedOn ?? r.receivedOn ?? "").slice(0, 7) === month))
    .filter((r) => !q || `${r.supplier} ${r.number ?? ""} ${r.fileName ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.issuedOn ?? b.receivedOn ?? "").localeCompare(a.issuedOn ?? a.receivedOn ?? ""));
  const total = list.reduce((s, r) => s + (r.gross ?? 0), 0);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Išči dobavitelja ali številko" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]" aria-label="Mesec">
          <option value="all">Vsi meseci</option>
          {months.map((m) => (
            <option key={m} value={m}>{m.slice(5)}/{m.slice(0, 4)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]" aria-label="Stanje">
          <option value="all">Vsa stanja</option>
          {(Object.keys(STATUS) as BillRow["status"][]).map((s) => (
            <option key={s} value={s}>{STATUS[s].text}</option>
          ))}
        </select>
        <span className="ml-auto text-[13px] font-semibold tabular">{list.length} računov · {eur(total)}</span>
      </div>
      {list.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">Ni računov v arhivu.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-subtle border-b border-line">
                <th className="px-3.5 py-2.5">Dobavitelj</th>
                <th className="px-3 py-2.5">Številka</th>
                <th className="px-3 py-2.5">Izdan</th>
                <th className="px-3 py-2.5">Rok plačila</th>
                <th className="px-3 py-2.5 text-right">Znesek</th>
                <th className="px-3 py-2.5">Stanje</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3.5 py-2.5 font-medium">{r.supplier}</td>
                  <td className="px-3 py-2.5">{r.number ?? "—"}</td>
                  <td className="px-3 py-2.5">{day(r.issuedOn)}</td>
                  <td className="px-3 py-2.5">{day(r.dueOn)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{r.gross != null ? eur(r.gross) : "—"}</td>
                  <td className="px-3 py-2.5"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge></td>
                  <td className="px-3 py-2.5 text-right">
                    {r.hasFile && (
                      <button type="button" onClick={() => onOpen(r.id)} className="text-wine underline underline-offset-2 text-[12.5px] font-medium">
                        Odpri
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------ cost tracking

function Costs({ rows }: { rows: BillRow[] }) {
  const t = today();
  const live = rows.filter((r) => r.status !== "rejected");
  const unpaid = live.filter((r) => UNPAID.includes(r.status));
  const sum = (xs: BillRow[]) => xs.reduce((s, r) => s + (r.gross ?? 0), 0);

  const bucket = (r: BillRow) => {
    if (!r.dueOn) return "none";
    const d = daysBetween(t, r.dueOn);
    return d < 0 ? "late" : d <= 7 ? "week" : d <= 30 ? "month" : "later";
  };
  const BUCKETS: { key: string; label: string; tone: string }[] = [
    { key: "late", label: "Zapadlo", tone: "text-danger" },
    { key: "week", label: "V 7 dneh", tone: "text-warn" },
    { key: "month", label: "V 8–30 dneh", tone: "text-ink" },
    { key: "later", label: "Kasneje", tone: "text-ink" },
    { key: "none", label: "Brez roka", tone: "text-ink-subtle" },
  ];

  const byMonth = new Map<string, { n: number; total: number; open: number }>();
  for (const r of live) {
    const m = (r.issuedOn ?? r.receivedOn ?? "").slice(0, 7);
    if (!m) continue;
    const cur = byMonth.get(m) ?? { n: 0, total: 0, open: 0 };
    cur.n++;
    cur.total += r.gross ?? 0;
    if (UNPAID.includes(r.status)) cur.open += r.gross ?? 0;
    byMonth.set(m, cur);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  const bySupplier = new Map<string, { n: number; total: number }>();
  for (const r of live) {
    const cur = bySupplier.get(r.supplier) ?? { n: 0, total: 0 };
    cur.n++;
    cur.total += r.gross ?? 0;
    bySupplier.set(r.supplier, cur);
  }
  const suppliers = [...bySupplier.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const maxMonth = Math.max(1, ...months.map(([, v]) => v.total));

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Kdaj plačati ({eur(sum(unpaid))} odprto)</h2>
        <div className="grid grid-cols-2 min-[900px]:grid-cols-5 gap-2.5">
          {BUCKETS.map((b) => {
            const xs = unpaid.filter((r) => bucket(r) === b.key);
            return (
              <Card key={b.key} className="p-3.5">
                <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{b.label}</p>
                <p className={cn("text-[18px] font-bold tabular mt-1", b.tone)}>{eur(sum(xs))}</p>
                <p className="text-[11.5px] text-ink-subtle">{xs.length} računov</p>
              </Card>
            );
          })}
        </div>
        {unpaid.filter((r) => ["late", "week"].includes(bucket(r))).length > 0 && (
          <Card className="mt-2.5">
            {unpaid
              .filter((r) => ["late", "week"].includes(bucket(r)))
              .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))
              .map((r, i, arr) => (
                <div key={r.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5", i < arr.length - 1 && "border-b border-line")}>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold truncate">{r.supplier}</p>
                    <p className="text-[12px] text-ink-muted">izdan {day(r.issuedOn)} · <DueLine b={r} /></p>
                  </div>
                  <span className="text-[13.5px] font-semibold tabular">{money(r.gross)}</span>
                </div>
              ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Stroški po mesecih izdaje</h2>
        <Card className="p-3.5 space-y-2.5">
          {months.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Ni podatkov.</p>
          ) : (
            months.map(([m, v]) => (
              <div key={m}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold">{m.slice(5)}/{m.slice(0, 4)}</span>
                  <span className="text-[12.5px] tabular">
                    <b>{eur(v.total)}</b> <span className="text-ink-subtle">· {v.n} računov{v.open > 0 ? ` · odprto ${eur(v.open)}` : ""}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-wine" style={{ width: `${Math.max(2, (v.total / maxMonth) * 100)}%` }} />
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">Največji dobavitelji</h2>
        <Card>
          {suppliers.length === 0 ? (
            <p className="p-3.5 text-[13px] text-ink-muted">Ni podatkov.</p>
          ) : (
            suppliers.map(([name, v], i) => (
              <div key={name} className={cn("flex items-center justify-between px-3.5 py-2.5", i < suppliers.length - 1 && "border-b border-line")}>
                <span className="text-[13.5px] font-medium">{name}</span>
                <span className="text-[13px] tabular"><b>{eur(v.total)}</b> <span className="text-ink-subtle">· {v.n}</span></span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- forms

const toInput = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

function EditBill({ b, onDone }: { b: BillRow; onDone: () => void }) {
  const [f, setF] = React.useState({
    supplierName: b.supplier,
    number: b.number ?? "",
    issuedOn: b.issuedOn ?? "",
    dueDate: b.dueOn ?? "",
    amountNet: toInput(b.net),
    amountGross: toInput(b.gross),
    iban: b.iban ?? "",
    reference: b.reference ?? "",
    note: b.note ?? "",
  });
  const [busy, start] = React.useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mt-3 rounded-[var(--radius-control)] border border-line p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input aria-label="Dobavitelj" placeholder="Dobavitelj" value={f.supplierName} onChange={set("supplierName")} />
        <Input aria-label="Številka računa" placeholder="Številka računa" value={f.number} onChange={set("number")} />
        <label className="text-[11.5px] text-ink-subtle">Datum izdaje<Input type="date" value={f.issuedOn} onChange={set("issuedOn")} /></label>
        <label className="text-[11.5px] text-ink-subtle">Rok plačila<Input type="date" value={f.dueDate} onChange={set("dueDate")} /></label>
        <Input inputMode="decimal" aria-label="Znesek brez DDV" placeholder="Znesek brez DDV (EUR)" value={f.amountNet} onChange={set("amountNet")} />
        <Input inputMode="decimal" aria-label="Znesek z DDV" placeholder="Znesek z DDV (EUR)" value={f.amountGross} onChange={set("amountGross")} />
        <Input aria-label="TRR" placeholder="TRR (IBAN)" value={f.iban} onChange={set("iban")} />
        <Input aria-label="Sklic" placeholder="Sklic" value={f.reference} onChange={set("reference")} />
      </div>
      <Input aria-label="Opomba" placeholder="Opomba" value={f.note} onChange={set("note")} />
      <Button
        size="sm"
        loading={busy}
        onClick={() =>
          start(async () => {
            const gross = f.amountGross.trim() ? parseAmount(f.amountGross) : null;
            const net = f.amountNet.trim() ? parseAmount(f.amountNet) : null;
            if ((f.amountGross.trim() && gross == null) || (f.amountNet.trim() && net == null)) {
              toast.error("Preverite zneske.");
              return;
            }
            const r = await updateBill(b.id, {
              supplierName: f.supplierName,
              number: f.number.trim() || null,
              issuedOn: f.issuedOn || null,
              dueDate: f.dueDate || null,
              amountNet: net,
              amountGross: gross,
              iban: f.iban.trim() || null,
              reference: f.reference.trim() || null,
              note: f.note.trim() || null,
            });
            if (r.ok) onDone();
            else toast.error(r.error);
          })
        }
      >
        Shrani spremembe
      </Button>
    </div>
  );
}

function AddBill({ onDone }: { onDone: () => void }) {
  const [f, setF] = React.useState({ supplierName: "", number: "", issuedOn: "", dueOn: "", amount: "", iban: "", reference: "" });
  const [busy, start] = React.useTransition();
  return (
    <Card className="p-3.5 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input placeholder="Dobavitelj" value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} />
        <Input placeholder="Številka računa" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        <label className="text-[11.5px] text-ink-subtle">Datum izdaje<Input type="date" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} /></label>
        <label className="text-[11.5px] text-ink-subtle">Rok plačila<Input type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></label>
        <Input inputMode="decimal" placeholder="Znesek z DDV (EUR)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input placeholder="TRR (IBAN)" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} />
        <Input placeholder="Sklic" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
      </div>
      <Button
        size="sm"
        loading={busy}
        onClick={() =>
          start(async () => {
            const amount = parseAmount(f.amount) ?? 0;
            if (!f.supplierName.trim() || !(amount > 0)) {
              toast.error("Vpišite dobavitelja in znesek.");
              return;
            }
            const r = await addSupplierBill({
              supplierName: f.supplierName,
              number: f.number || null,
              issuedOn: f.issuedOn || null,
              dueDate: f.dueOn || null,
              amountGross: amount,
              iban: f.iban || null,
              reference: f.reference || null,
            });
            if (r.ok) onDone();
            else toast.error(r.error);
          })
        }
      >
        Shrani račun
      </Button>
    </Card>
  );
}
