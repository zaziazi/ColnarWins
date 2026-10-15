"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmMatch, setTxStatus, uploadStatement, type StatementReport } from "../actions";

export interface TxRow {
  id: string;
  bookedOn: string;
  amount: number;
  counterparty: string | null;
  reference: string | null;
  purpose: string | null;
  status: "suggested" | "confirmed" | "unmatched" | "ignored";
  matchedKind: "invoice" | "bill" | null;
  matchedId: string | null;
  score: number | null;
}
type Opt = { id: string; label: string; amount: number };

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("sl-SI");

export function Payments({ rows, invoiceOpts, billOpts }: { rows: TxRow[]; invoiceOpts: Opt[]; billOpts: Opt[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"todo" | "done">("todo");
  const [report, setReport] = React.useState<StatementReport | null>(null);
  const [busy, start] = React.useTransition();
  const todo = rows.filter((r) => r.status === "suggested" || r.status === "unmatched");
  const done = rows.filter((r) => r.status === "confirmed" || r.status === "ignored");
  const list = tab === "todo" ? todo : done;

  async function pick(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    start(async () => {
      const r = await uploadStatement(f.name, text);
      if (r.ok) {
        setReport(r.report);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-2">
        <p className="text-[14.5px] font-semibold">Naloži bančni izpisek</p>
        <p className="text-[12.5px] text-ink-muted">
          Datoteka iz spletne banke: CSV ali camt.053 (XML). Colnix predlaga, kateri račun je plačan; nič se ne zabeleži, dokler ne potrdite.
        </p>
        <input type="file" accept=".csv,.xml,.txt,text/csv,text/xml" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} className="text-[13px]" />
        {busy && <p className="text-[12.5px] text-ink-muted">Berem izpisek …</p>}
        {report && (
          <p className="text-[13px] rounded-[var(--radius-control)] bg-surface-muted p-2.5">
            {report.format}: {report.lines} vrstic · dodanih <b>{report.added}</b> · že znanih {report.duplicates} · predlogov {report.suggested}
            {report.skipped > 0 ? ` · preskočenih ${report.skipped}` : ""}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        {([["todo", `Za pregled (${todo.length})`], ["done", "Urejeno"]] as const).map(([k, t]) => (
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

      {list.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">{tab === "todo" ? "Ni plačil za pregled. Naložite izpisek iz banke." : "Ni urejenih plačil."}</p>
        </Card>
      ) : (
        list.map((t) => <TxCard key={t.id} t={t} invoiceOpts={invoiceOpts} billOpts={billOpts} />)
      )}
    </div>
  );
}

function TxCard({ t, invoiceOpts, billOpts }: { t: TxRow; invoiceOpts: Opt[]; billOpts: Opt[] }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [target, setTarget] = React.useState(t.matchedId ?? "");
  const incoming = t.amount > 0;
  const kind: "invoice" | "bill" = incoming ? "invoice" : "bill";
  const opts = incoming ? invoiceOpts : billOpts;
  const suggested = t.status === "suggested" ? opts.find((o) => o.id === t.matchedId) : null;
  // amounts that fit come first
  const sorted = [...opts].sort((a, b) => Math.abs(a.amount - Math.abs(t.amount)) - Math.abs(b.amount - Math.abs(t.amount)));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Napaka");
      else router.refresh();
    });
  }

  return (
    <Card className="p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[14.5px] truncate">{t.counterparty ?? "Neznan partner"}</p>
          <p className="text-[12px] text-ink-subtle mt-0.5">
            {day(t.bookedOn)}
            {t.reference ? ` · sklic ${t.reference}` : ""}
          </p>
          {t.purpose && <p className="text-[12.5px] text-ink-muted mt-0.5 line-clamp-2">{t.purpose}</p>}
        </div>
        <div className="text-right">
          <p className={cn("text-[15px] font-bold tabular", incoming ? "text-good-ink" : "text-wine")}>
            {incoming ? "+" : "−"} {eur(Math.abs(t.amount))}
          </p>
          {t.status === "confirmed" && <Badge tone="good">Potrjeno</Badge>}
          {t.status === "ignored" && <Badge>Prezrto</Badge>}
        </div>
      </div>

      {(t.status === "suggested" || t.status === "unmatched") && (
        <div className="mt-3 space-y-2">
          {suggested && (
            <p className="text-[13px]">
              Predlog: <b>{suggested.label}</b> ({eur(suggested.amount)}) {t.score != null && <span className="text-ink-subtle">· zanesljivost {Math.round(t.score * 100)} %</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-9 max-w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]"
              aria-label={incoming ? "Račun kupca" : "Račun dobavitelja"}
            >
              <option value="">{incoming ? "Izberite račun kupca …" : "Izberite račun dobavitelja …"}</option>
              {sorted.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {eur(o.amount)}
                </option>
              ))}
            </select>
            <Button size="sm" loading={busy} disabled={!target} onClick={() => run(() => confirmMatch(t.id, kind, target))}>
              Potrdi plačilo
            </Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => setTxStatus(t.id, "ignored"))}>
              Prezri
            </Button>
          </div>
        </div>
      )}
      {t.status === "ignored" && (
        <div className="mt-2">
          <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => setTxStatus(t.id, "unmatched"))}>
            Vrni na pregled
          </Button>
        </div>
      )}
    </Card>
  );
}
