"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { eur } from "@/lib/format";
import { LEVEL_TEXT, type DunningLevel } from "@/lib/finance/dunning";
import { cn } from "@/lib/utils";
import { importInvoices, sendReminder, setDunningPaused, setInvoiceDisputed, skipReminder, type ImportReport } from "../actions";

export interface InvoiceRow {
  id: string;
  customerId: string;
  customer: string;
  email: string | null;
  phone: string | null;
  paused: boolean;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  gross: number;
  balance: number;
  daysOverdue: number;
  disputed: boolean;
  nextLevel: DunningLevel | null;
  lastSentAt: string | null;
}

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("sl-SI") : "—");

export function Invoices({ rows, mailReady }: { rows: InvoiceRow[]; mailReady: boolean }) {
  const [tab, setTab] = React.useState<"opomini" | "odprti" | "uvoz">("opomini");
  const reminders = rows.filter((r) => r.nextLevel && !r.disputed);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {([["opomini", `Opomini (${reminders.length})`], ["odprti", `Odprti računi (${rows.length})`], ["uvoz", "Uvoz računov"]] as const).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border", tab === k ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "opomini" && <Reminders rows={reminders} mailReady={mailReady} />}
      {tab === "odprti" && <OpenList rows={rows} />}
      {tab === "uvoz" && <ImportPanel />}
    </div>
  );
}

function Reminders({ rows, mailReady }: { rows: InvoiceRow[]; mailReady: boolean }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Napaka");
      else router.refresh();
    });
  }
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[13.5px] text-ink-muted">Nobenega opomina ni treba poslati.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] text-ink-muted">
        Opomin se pošlje šele, ko ga potrdite. Prijazen opomin po 3 dneh zamude, drugi po 15, zadnji po 30; po 60 dneh je na vrsti osebni klic.
      </p>
      {rows.map((r) => {
        const level = r.nextLevel!;
        const call = level === "escalated";
        return (
          <Card key={r.id} className="p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[15px] truncate">{r.customer}</p>
                <p className="text-[12.5px] text-ink-muted mt-0.5">
                  Račun {r.number ?? "—"} · rok {day(r.dueOn)} · <span className="font-semibold tabular">{eur(r.balance)}</span>
                </p>
                <p className="text-[11.5px] text-ink-subtle mt-0.5">
                  {r.email ?? "brez e-naslova"}
                  {r.phone ? ` · ${r.phone}` : ""}
                  {r.lastSentAt ? ` · zadnji opomin ${day(r.lastSentAt)}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge tone={r.daysOverdue >= 30 ? "danger" : "warn"}>{r.daysOverdue} dni v zamudi</Badge>
                <Badge tone="wine">{LEVEL_TEXT[level]}</Badge>
              </div>
            </div>
            {r.paused && <p className="text-[12px] text-warn mt-2">Opomini za to stranko so zamrznjeni.</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {!call && (
                <Button
                  size="sm"
                  loading={busy}
                  disabled={!r.email || r.paused || !mailReady}
                  onClick={() => {
                    if (!window.confirm(`Pošljem opomin na ${r.email}?`)) return;
                    run(() => sendReminder(r.id, level));
                  }}
                >
                  Pošlji opomin
                </Button>
              )}
              <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => skipReminder(r.id, level))}>
                {call ? "Klic opravljen" : "Preskoči"}
              </Button>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => setDunningPaused(r.customerId, !r.paused))}>
                {r.paused ? "Odmrzni stranko" : "Zamrzni stranko"}
              </Button>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => setInvoiceDisputed(r.id, true))}>
                Sporen račun
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function OpenList({ rows }: { rows: InvoiceRow[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [onlyLate, setOnlyLate] = React.useState(false);
  const list = rows.filter((r) => (!onlyLate || r.daysOverdue > 0) && (!q || `${r.customer} ${r.number ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const total = list.reduce((s, r) => s + r.balance, 0);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" placeholder="Išči kupca ali številko" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} /> Samo zapadli
        </label>
        <span className="ml-auto text-[13px] font-semibold tabular">{eur(total)}</span>
      </div>
      {list.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">{rows.length === 0 ? "Ni odprtih računov. Računi se pojavijo po uvozu iz e-računov ali po dostavi." : "Ni zadetkov."}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-subtle border-b border-line">
                <th className="px-3.5 py-2.5">Kupec</th>
                <th className="px-3 py-2.5">Račun</th>
                <th className="px-3 py-2.5">Rok</th>
                <th className="px-3 py-2.5 text-right">Odprto</th>
                <th className="px-3 py-2.5">Stanje</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3.5 py-2.5 font-medium">{r.customer}</td>
                  <td className="px-3 py-2.5">{r.number ?? "—"}</td>
                  <td className="px-3 py-2.5">{day(r.dueOn)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{eur(r.balance)}</td>
                  <td className="px-3 py-2.5">
                    {r.disputed ? (
                      <button type="button" className="underline text-[12px]" onClick={async () => { const x = await setInvoiceDisputed(r.id, false); if (x.ok) router.refresh(); else toast.error(x.error); }}>
                        <Badge tone="danger">Sporen</Badge>
                      </button>
                    ) : r.daysOverdue > 0 ? (
                      <Badge tone={r.daysOverdue > 30 ? "danger" : "warn"}>{r.daysOverdue} dni</Badge>
                    ) : (
                      <Badge tone="good">V roku</Badge>
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

function ImportPanel() {
  const router = useRouter();
  const [text, setText] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [busy, start] = React.useTransition();

  async function pick(f: File | undefined) {
    setReport(null);
    if (!f) return;
    setName(f.name);
    const t = await f.text();
    setText(t);
    start(async () => {
      const r = await importInvoices(t, false);
      if (r.ok) setReport(r.report);
      else toast.error(r.error);
    });
  }
  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-[14.5px] font-semibold">Uvoz računov iz e-računov</p>
        <p className="text-[12.5px] text-ink-muted mt-0.5">
          V e-računih izvozite seznam izdanih računov (CSV) in ga naložite sem. Najprej vidite, kaj bo uvoženo; nič se ne podvoji, če isto datoteko naložite še enkrat.
        </p>
      </div>
      <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="text-[13px]" />
      {report && (
        <div className="rounded-[var(--radius-control)] bg-surface-muted p-3 text-[13px] space-y-1">
          <p className="font-semibold">{name}</p>
          <p>Vrstic: {report.total} · za uvoz: <b>{report.matched}</b> · že v Colnixu: {report.alreadyThere} · brez znane stranke: {report.unmatched.length}</p>
          {report.sample.length > 0 && (
            <ul className="text-[12.5px] text-ink-muted list-disc pl-5">
              {report.sample.map((s) => (
                <li key={s.number}>
                  {s.number} · {s.customer} · {eur(s.gross)}
                  {s.paid ? " · plačano" : ""}
                </li>
              ))}
            </ul>
          )}
          {report.unmatched.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[12.5px] text-warn">Računi, katerih stranke ne najdem (ne bodo uvoženi)</summary>
              <ul className="text-[12.5px] text-ink-muted list-disc pl-5 mt-1 max-h-40 overflow-y-auto">
                {report.unmatched.slice(0, 80).map((u, i) => (
                  <li key={i}>{u.number} · {u.customer}</li>
                ))}
              </ul>
            </details>
          )}
          <Button
            size="sm"
            className="mt-2"
            loading={busy}
            disabled={report.matched === 0 || report.imported > 0}
            onClick={() =>
              start(async () => {
                const r = await importInvoices(text!, true);
                if (r.ok) {
                  setReport(r.report);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {report.imported > 0 ? `Uvoženo: ${report.imported}` : `Uvozi ${report.matched} računov`}
          </Button>
        </div>
      )}
    </Card>
  );
}
