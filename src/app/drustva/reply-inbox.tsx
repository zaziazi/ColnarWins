"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { addDays, todayIso } from "@/lib/sales/dates";
import type { ReplyTask } from "@/lib/types";
import { dismissTask, finishCall, linkTaskToDrustvo, retryTriage, sendReply } from "./actions";
import { INTENT_LABEL, INTENT_TONE } from "./constants";

const dt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

const URGENCY: Record<string, string> = { today: "Danes", this_week: "Ta teden", low: "Ni nujno" };

export function ReplyInbox({
  tasks,
  drustva,
}: {
  tasks: ReplyTask[];
  drustva: { id: string; name: string; town: string | null }[];
}) {
  if (tasks.length === 0) {
    return (
      <Card className="p-7 text-center">
        <p className="text-[14px] font-semibold">Ni odgovorov, ki bi čakali.</p>
        <p className="text-[12.5px] text-ink-muted mt-1.5 leading-relaxed">
          Ko društvo odgovori na e-pošto, se tukaj pokaže kartica, telefon pa zazvoni z obvestilom.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} drustva={drustva} />
      ))}
    </div>
  );
}

function TaskCard({ task: t, drustva }: { task: ReplyTask; drustva: { id: string; name: string; town: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [calling, setCalling] = React.useState(false);
  const [laterOn, setLaterOn] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState(t.draftBody ?? "");
  const [subject, setSubject] = React.useState(t.draftSubject ?? (t.subject ? (t.subject.toLowerCase().startsWith("re:") ? t.subject : `Re: ${t.subject}`) : ""));

  async function run(p: Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Ni uspelo.");
    if (ok) toast.success(ok);
    router.refresh();
  }

  const unknown = !t.drustvoId;
  const snippet = t.summary ?? (t.body ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  const phone = t.drustvoPhone;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[15px] leading-snug">{t.drustvoName ?? `Neznan pošiljatelj: ${t.fromEmail ?? "?"}`}</div>
          <div className="text-[12px] text-ink-subtle mt-0.5">
            {[t.drustvoType, t.drustvoTown, t.drustvoDistanceKm !== null ? `${t.drustvoDistanceKm} km` : null, dt.format(new Date(t.createdAt))]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {t.kind === "call" && <Badge tone="wine">Klic danes</Badge>}
          {t.kind === "reminder" && <Badge tone="info">Opomnik</Badge>}
          {t.kind === "thank_you" && <Badge tone="good">Zahvala</Badge>}
          {t.kind === "reply" && t.intent && <Badge tone={INTENT_TONE[t.intent]}>{INTENT_LABEL[t.intent]}</Badge>}
          {t.urgency === "today" && <Badge tone="danger">{URGENCY.today}</Badge>}
          {t.status === "ai_failed" && <Badge tone="warn">Brez povzetka</Badge>}
        </div>
      </div>

      <p className="text-[13.5px] mt-2.5 leading-relaxed">{snippet || "(prazno sporočilo)"}</p>
      {t.recommendedAction && t.recommendedAction !== "none" && (
        <p className="text-[12.5px] mt-1.5">
          <span className="font-semibold">{t.recommendedAction === "call" ? "📞 Pokliči" : "✉️ Odgovori po e-pošti"}</span>
          {t.reason && <span className="text-ink-muted"> — {t.reason}</span>}
        </p>
      )}

      {t.kind === "reply" && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-[12px] font-semibold text-wine">
          {open ? "Skrij e-pošto" : "Pokaži celotno e-pošto"}
        </button>
      )}
      {open && t.kind === "reply" && (
        <div className="mt-2 rounded-[12px] bg-surface-muted p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap">
          {t.subject && <div className="font-semibold mb-1">{t.subject}</div>}
          {t.body || "(brez besedila)"}
          {t.uniboxUrl && (
            <a href={t.uniboxUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-wine">
              Odpri v Instantly <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}

      {unknown && (
        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-1.5">Poveži z društvom</div>
          <Combobox
            options={drustva.map((d) => ({ value: d.id, label: d.name, hint: d.town ?? undefined }))}
            value={null}
            onChange={(id) => void run(linkTaskToDrustvo(t.id, id), "Povezano")}
            placeholder="Izberi društvo…"
            searchPlaceholder="Išči društvo…"
          />
        </div>
      )}

      {!unknown && t.kind !== "call" && t.intent !== "unsubscribe" && t.intent !== "out_of_office" && (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
            {t.draftBody ? "Osnutek odgovora" : "Odgovor"}
          </div>
          {t.proposedDates && t.proposedDates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {t.proposedDates.map((d) => (
                <Badge key={d} tone="info">{d.slice(8, 10)}. {d.slice(5, 7)}. {d.slice(0, 4)}</Badge>
              ))}
            </div>
          )}
          <Textarea className="min-h-[130px]" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Napiši odgovor ali uporabi osnutek…" />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !draft.trim()}
              onClick={() => {
                if (!window.confirm("Poslati odgovor društvu?")) return;
                void run(sendReply({ taskId: t.id, subject, body: draft }), "Odgovor poslan");
              }}
            >
              Pošlji odgovor
            </Button>
            {t.kind === "reply" && (t.status === "ai_failed" || t.status === "new") && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(retryTriage(t.id), "Povzetek pripravljen")}>
                Poskusi znova (AI)
              </Button>
            )}
          </div>
          {t.error && t.status === "ai_failed" && <p className="text-[11.5px] text-ink-subtle">{t.error}</p>}
        </div>
      )}

      {!calling ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCalling(true)}
            disabled={busy || unknown}
          >
            <Phone className="size-4" /> Pokličem
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void run(t.drustvoId ? finishCall(t.id, t.drustvoId, { outcome: "not_interested" }) : dismissTask(t.id), "Zabeleženo")}
            disabled={busy}
          >
            Ni zainteresiran
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void run(dismissTask(t.id), "Zaprto")} disabled={busy}>
            Zapri
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-[12px] border border-line p-3 space-y-2.5">
          {phone ? (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-2 text-[15px] font-bold text-wine">
              <Phone className="size-4" /> {phone}
            </a>
          ) : (
            <p className="text-[12.5px] text-ink-muted">Telefon še ni vnesen — dodaj ga v seznamu društev.</p>
          )}
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">Kako je šlo?</div>
          <div className="grid grid-cols-1 gap-2">
            <Button size="sm" onClick={() => void run(finishCall(t.id, t.drustvoId, { outcome: "booked" }), "Označeno kot rezervirano — vnesi obisk v zavihku Obiski.")} disabled={busy}>
              Rezervirali
            </Button>
            {laterOn === null ? (
              <Button size="sm" variant="secondary" onClick={() => setLaterOn(addDays(todayIso(), 14))} disabled={busy}>
                Kasneje
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input type="date" value={laterOn} min={todayIso()} onChange={(e) => setLaterOn(e.target.value)} className="h-9" />
                <Button size="sm" onClick={() => void run(finishCall(t.id, t.drustvoId, { outcome: "later", callAgainOn: laterOn }), "Opomnik shranjen")} disabled={busy}>
                  Shrani
                </Button>
              </div>
            )}
            <Button size="sm" variant="secondary" onClick={() => void run(finishCall(t.id, t.drustvoId, { outcome: "not_interested" }), "Zabeleženo")} disabled={busy}>
              Niso zainteresirani
            </Button>
          </div>
          <button type="button" className="text-[12px] text-ink-subtle underline" onClick={() => setCalling(false)}>
            Prekliči
          </button>
        </div>
      )}
    </Card>
  );
}
