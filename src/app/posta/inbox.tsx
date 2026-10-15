"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, ChevronDown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { INBOX_LABELS, LABEL_TEXT, type InboxLabel } from "@/lib/inbox/labels";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/lib/finance/csv";
import { addSupplierBill, assignEmail, attachmentUrl, retryInboxTriage, sendInboxReply, setLabel, setStatus } from "./actions";

export interface InboxItem {
  id: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  body: string;
  receivedAt: string;
  label: InboxLabel;
  labelConfirmed: boolean;
  summary: string | null;
  nextStep: string | null;
  draftReply: string | null;
  extracted: {
    urgent?: boolean;
    known_customer?: string | null;
    order?: { customer_name?: string | null; delivery_date?: string | null; lines?: { product: string; quantity?: number | null; unit?: string | null }[]; note?: string | null } | null;
    bill?: { supplier_name?: string | null; number?: string | null; issued_on?: string | null; due_date?: string | null; amount_gross?: number | null; iban?: string | null; reference?: string | null } | null;
  } | null;
  status: "new" | "needs_decision" | "done" | "ignored";
  assignedTo: string | null;
  linkedKind: string | null;
  attachments: { name: string; path: string; type: string; size: number }[];
  aiError: string | null;
  replySentAt: string | null;
}

const TONE: Record<InboxLabel, "neutral" | "wine" | "good" | "warn" | "danger" | "info"> = {
  order: "good",
  bill: "warn",
  reservation: "info",
  drustvo: "info",
  complaint: "danger",
  newsletter: "neutral",
  unclear: "neutral",
};

const when = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana" });

export function Inbox({ open, closed, people, meId }: { open: InboxItem[]; closed: InboxItem[]; people: { id: string; name: string }[]; meId: string }) {
  const [tab, setTab] = React.useState<"open" | "closed">("open");
  const [label, setLabelFilter] = React.useState<InboxLabel | "all">("all");
  const [mine, setMine] = React.useState(false);
  const list = (tab === "open" ? open : closed).filter((m) => (label === "all" || m.label === label) && (!mine || m.assignedTo === meId));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([["open", `Za odločitev (${open.length})`], ["closed", "Opravljeno"]] as const).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border", tab === k ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}
          >
            {t}
          </button>
        ))}
        <select
          value={label}
          onChange={(e) => setLabelFilter(e.target.value as InboxLabel | "all")}
          className="h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]"
          aria-label="Vrsta"
        >
          <option value="all">Vse vrste</option>
          {INBOX_LABELS.map((l) => (
            <option key={l} value={l}>{LABEL_TEXT[l]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Moje
        </label>
      </div>

      {list.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-ink-muted">{tab === "open" ? "Ni sporočil, ki bi čakala na odločitev." : "Ni opravljenih sporočil."}</p>
        </Card>
      ) : (
        list.map((m) => <Row key={m.id} m={m} people={people} />)
      )}
    </div>
  );
}

function Row({ m, people }: { m: InboxItem; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [busy, start] = React.useTransition();
  const [reply, setReply] = React.useState(m.draftReply ?? "");
  const [showBill, setShowBill] = React.useState(false);
  const b = m.extracted?.bill;
  const [bill, setBill] = React.useState({
    supplierName: b?.supplier_name ?? m.fromName ?? m.fromEmail ?? "",
    number: b?.number ?? "",
    issuedOn: b?.issued_on ?? "",
    dueDate: b?.due_date ?? "",
    amountGross: b?.amount_gross != null ? String(b.amount_gross).replace(".", ",") : "",
    iban: b?.iban ?? "",
    reference: b?.reference ?? "",
  });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Napaka");
      else router.refresh();
    });
  }

  async function openAttachment(path: string) {
    const r = await attachmentUrl(path);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else toast.error(r.error);
  }

  const order = m.extracted?.order;
  const sender = m.fromName ? `${m.fromName} <${m.fromEmail ?? ""}>` : (m.fromEmail ?? "neznan pošiljatelj");

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="w-full text-left px-4 py-3.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[m.label]}>{LABEL_TEXT[m.label]}</Badge>
            {!m.labelConfirmed && m.summary && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
                <Sparkles className="size-3" /> predlog
              </span>
            )}
            {m.extracted?.urgent && <Badge tone="danger">Nujno</Badge>}
            {m.replySentAt && <Badge tone="good">Odgovorjeno</Badge>}
            {m.linkedKind === "bill" && <Badge tone="warn">Račun ustvarjen</Badge>}
            {m.attachments.length > 0 && <Paperclip className="size-3.5 text-ink-subtle" />}
            <span className="text-[11.5px] text-ink-subtle ml-auto">{when.format(new Date(m.receivedAt))}</span>
          </div>
          <p className="text-[14.5px] font-semibold mt-1.5 truncate">{m.fromName || m.fromEmail || "—"}</p>
          <p className="text-[13px] text-ink-muted mt-0.5">{m.summary ?? m.subject ?? "(brez zadeve)"}</p>
          {m.nextStep && <p className="text-[12.5px] text-wine font-medium mt-1">Naslednji korak: {m.nextStep}</p>}
          {m.aiError && !m.summary && <p className="text-[12px] text-danger mt-1">Branje ni uspelo: {m.aiError}</p>}
        </div>
        <ChevronDown className={cn("size-5 text-ink-subtle mt-1 transition-transform shrink-0", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-3.5 space-y-4">
          <div>
            <p className="text-[11.5px] text-ink-subtle">Od: {sender}</p>
            {m.subject && <p className="text-[13px] font-semibold mt-0.5">{m.subject}</p>}
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] text-ink-muted max-h-64 overflow-y-auto">{m.body || "(prazno)"}</pre>
            {m.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <button key={a.path} type="button" onClick={() => openAttachment(a.path)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-wine underline underline-offset-2">
                    <Paperclip className="size-3.5" />
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {order && (order.lines?.length ?? 0) > 0 && (
            <div className="rounded-[var(--radius-control)] bg-surface-muted p-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Naročilo, kot ga je prebral pomočnik</p>
              <p className="text-[13px] mt-1">
                {order.customer_name ?? m.extracted?.known_customer ?? "stranka ni znana"}
                {order.delivery_date ? ` · dostava ${order.delivery_date}` : ""}
              </p>
              <ul className="text-[13px] mt-1 list-disc pl-5">
                {order.lines!.map((l, i) => (
                  <li key={i}>
                    {l.quantity ?? "?"} {l.unit ?? ""} {l.product}
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="secondary" className="mt-2.5">
                <Link href="/pisarna/novo">Odpri novo naročilo</Link>
              </Button>
              <p className="text-[11.5px] text-ink-subtle mt-1.5">Naročilo vnesete vi; pomočnik ga ne ustvari sam.</p>
            </div>
          )}

          {(m.label === "bill" || showBill) && m.linkedKind !== "bill" && (
            <div className="rounded-[var(--radius-control)] border border-line p-3 space-y-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Račun dobavitelja</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Dobavitelj" value={bill.supplierName} onChange={(e) => setBill({ ...bill, supplierName: e.target.value })} />
                <Input placeholder="Številka računa" value={bill.number} onChange={(e) => setBill({ ...bill, number: e.target.value })} />
                <Input type="date" aria-label="Datum računa" value={bill.issuedOn} onChange={(e) => setBill({ ...bill, issuedOn: e.target.value })} />
                <Input type="date" aria-label="Rok plačila" value={bill.dueDate} onChange={(e) => setBill({ ...bill, dueDate: e.target.value })} />
                <Input inputMode="decimal" placeholder="Znesek z DDV (EUR)" value={bill.amountGross} onChange={(e) => setBill({ ...bill, amountGross: e.target.value })} />
                <Input placeholder="TRR (IBAN)" value={bill.iban} onChange={(e) => setBill({ ...bill, iban: e.target.value })} />
                <Input placeholder="Sklic" value={bill.reference} onChange={(e) => setBill({ ...bill, reference: e.target.value })} />
              </div>
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  run(() => {
                    const amount = parseAmount(bill.amountGross) ?? 0;
                    if (!(amount > 0)) return Promise.resolve({ ok: false, error: "Vpišite znesek." });
                    return addSupplierBill(
                      {
                        supplierName: bill.supplierName,
                        number: bill.number || null,
                        issuedOn: bill.issuedOn || null,
                        dueDate: bill.dueDate || null,
                        amountGross: amount,
                        iban: bill.iban || null,
                        reference: bill.reference || null,
                      },
                      m.id,
                    );
                  })
                }
              >
                Shrani račun za potrditev
              </Button>
            </div>
          )}
          {m.linkedKind === "bill" && (
            <Button asChild size="sm" variant="secondary">
              <Link href="/finance/dobavitelji">Odpri račune dobaviteljev</Link>
            </Button>
          )}

          {m.fromEmail && m.label !== "newsletter" && m.label !== "bill" && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Odgovor{m.draftReply ? " (osnutek pomočnika, uredite pred pošiljanjem)" : ""}</p>
              <Textarea rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Besedilo odgovora" />
              <Button
                size="sm"
                loading={busy}
                disabled={!reply.trim()}
                onClick={() => {
                  if (!window.confirm(`Pošljem odgovor na ${m.fromEmail}?`)) return;
                  run(() => sendInboxReply(m.id, "", reply));
                }}
              >
                Pošlji odgovor
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              value={m.label}
              onChange={(e) => run(() => setLabel(m.id, e.target.value))}
              className="h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]"
              aria-label="Vrsta sporočila"
            >
              {INBOX_LABELS.map((l) => (
                <option key={l} value={l}>{LABEL_TEXT[l]}</option>
              ))}
            </select>
            <select
              value={m.assignedTo ?? ""}
              onChange={(e) => run(() => assignEmail(m.id, e.target.value || null))}
              className="h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px]"
              aria-label="Dodeljeno"
            >
              <option value="">Nedodeljeno</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {m.label !== "bill" && m.linkedKind !== "bill" && (
              <Button size="sm" variant="ghost" onClick={() => setShowBill((v) => !v)}>
                Je račun
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => retryInboxTriage(m.id))}>
              Preberi znova
            </Button>
            <span className="flex-1" />
            {m.status === "done" || m.status === "ignored" ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => setStatus(m.id, "needs_decision"))}>
                Vrni med odprta
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => setStatus(m.id, "ignored"))}>
                  Ni pomembno
                </Button>
                <Button size="sm" loading={busy} onClick={() => run(() => setStatus(m.id, "done"))}>
                  Opravljeno
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
