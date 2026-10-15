"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/lib/finance/csv";
import { addSupplierBill, attachmentUrl } from "@/app/posta/actions";
import { approveBill, markBillPaid, rejectBill, saveAccountantEmail, sendBillsToAccountant } from "../actions";

export interface BillRow {
  id: string;
  supplier: string;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  gross: number;
  iban: string | null;
  reference: string | null;
  status: "to_approve" | "flagged" | "approved" | "sent_to_accountant" | "paid" | "rejected";
  warnings: { code: string; text: string }[];
  attachmentPath: string | null;
  note: string | null;
  sentAt: string | null;
  paidAt: string | null;
}

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("sl-SI") : "—");
const STATUS: Record<BillRow["status"], { text: string; tone: "neutral" | "warn" | "good" | "danger" | "info" }> = {
  to_approve: { text: "Čaka potrditev", tone: "warn" },
  flagged: { text: "Preverite", tone: "danger" },
  approved: { text: "Potrjen", tone: "info" },
  sent_to_accountant: { text: "Poslan računovodji", tone: "good" },
  paid: { text: "Plačan", tone: "good" },
  rejected: { text: "Zavrnjen", tone: "neutral" },
};

export function Bills({ rows, accountantEmail, mailReady }: { rows: BillRow[]; accountantEmail: string; mailReady: boolean }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [tab, setTab] = React.useState<"todo" | "approved" | "done">("todo");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [email, setEmail] = React.useState(accountantEmail);
  const [adding, setAdding] = React.useState(false);

  const todo = rows.filter((r) => r.status === "to_approve" || r.status === "flagged");
  const approved = rows.filter((r) => r.status === "approved" || r.status === "sent_to_accountant");
  const done = rows.filter((r) => r.status === "paid" || r.status === "rejected");
  const list = tab === "todo" ? todo : tab === "approved" ? approved : done;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Napaka");
      else router.refresh();
    });
  }
  async function open(path: string) {
    const r = await attachmentUrl(path);
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([["todo", `Za potrditev (${todo.length})`], ["approved", `Potrjeni (${approved.length})`], ["done", "Zaključeni"]] as const).map(([k, t]) => (
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

      {list.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">
            {tab === "todo" ? "Ni računov, ki bi čakali na potrditev. Računi iz pošte se pojavijo tukaj." : "Ni računov."}
          </p>
        </Card>
      ) : (
        list.map((b) => {
          const st = STATUS[b.status];
          const ibanChanged = b.warnings.some((w) => w.code === "iban_changed");
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
                  </div>
                  <p className="text-[12.5px] text-ink-muted mt-0.5">
                    {b.number ? `Št. ${b.number} · ` : ""}rok {day(b.dueOn)} · <span className="font-semibold tabular">{eur(b.gross)}</span>
                  </p>
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
                      <p key={i} className={cn("flex items-start gap-1.5 text-[12.5px] mt-1.5", ["duplicate", "iban_changed", "unusual_amount"].includes(w.code) ? "text-danger" : "text-warn")}>
                        <TriangleAlert className="size-3.5 mt-0.5 shrink-0" /> {w.text}
                      </p>
                    ))}
                </div>
                {b.attachmentPath && (
                  <button type="button" onClick={() => open(b.attachmentPath!)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-wine underline underline-offset-2">
                    <Paperclip className="size-3.5" /> Račun
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {(b.status === "to_approve" || b.status === "flagged") && (
                  <>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() => {
                        if (ibanChanged && !window.confirm("TRR se razlikuje od prejšnjega. Ste preverili po telefonu, da je nov TRR pravi?")) return;
                        run(() => approveBill(b.id, ibanChanged));
                      }}
                    >
                      Potrdi
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
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
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => markBillPaid(b.id))}>
                    Označi kot plačano
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}
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
        <Input type="date" aria-label="Datum računa" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} />
        <Input type="date" aria-label="Rok plačila" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
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
