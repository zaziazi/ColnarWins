"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Mail, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { fold } from "@/app/prodaja/constants";
import type { Drustvo, DrustvoMessage, DrustvoStage } from "@/lib/types";
import { loadThread, updateDrustvo } from "../actions";
import { ACTIVITY_LABEL, EMAIL_CHECK_LABEL, STAGE_LABEL, STAGE_TONE, TIER_LABEL } from "../constants";

const PAGE = 50;
const selectCls = "h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[12.5px] min-w-0";

export function DrustvaList({ drustva }: { drustva: Drustvo[] }) {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [activity, setActivity] = React.useState("");
  const [band, setBand] = React.useState("");
  const [wave, setWave] = React.useState("");
  const [type, setType] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const types = React.useMemo(() => [...new Set(drustva.map((d) => d.type).filter(Boolean))].sort() as string[], [drustva]);
  const bands = React.useMemo(() => [...new Set(drustva.map((d) => d.distanceBand).filter(Boolean))].sort() as string[], [drustva]);

  const filtered = React.useMemo(() => {
    const q = fold(query.trim());
    return drustva.filter((d) => {
      if (tier && d.tier !== tier) return false;
      if (stage && d.stage !== stage) return false;
      if (activity && d.activityLevel !== activity) return false;
      if (band && d.distanceBand !== band) return false;
      if (type && d.type !== type) return false;
      if (wave === "none" ? d.wave !== null : wave && String(d.wave) !== wave) return false;
      if (q && !fold(d.name).includes(q) && !fold(d.town ?? "").includes(q) && !d.email.includes(q)) return false;
      return true;
    });
  }, [drustva, query, tier, stage, activity, band, type, wave]);

  React.useEffect(() => setShown(PAGE), [query, tier, stage, activity, band, type, wave]);
  const open = openId ? drustva.find((d) => d.id === openId) ?? null : null;

  return (
    <div>
      <div className="relative mb-2.5">
        <Search className="size-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Išči po imenu, kraju ali e-pošti…" className="pl-9" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Prioriteta">
          <option value="">Vse prioritete</option>
          {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectCls} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stanje">
          <option value="">Vsa stanja</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectCls} value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="Aktivnost">
          <option value="">Vsa aktivnost</option>
          {Object.entries(ACTIVITY_LABEL).map(([k, v]) => <option key={k} value={k}>Aktivnost: {v}</option>)}
        </select>
        <select className={selectCls} value={band} onChange={(e) => setBand(e.target.value)} aria-label="Razdalja">
          <option value="">Vse razdalje</option>
          {bands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Vrsta">
          <option value="">Vse vrste</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectCls} value={wave} onChange={(e) => setWave(e.target.value)} aria-label="Val">
          <option value="">Vsi valovi</option>
          <option value="none">Brez vala</option>
          {[0, 1, 2, 3, 4].map((w) => <option key={w} value={String(w)}>Val {w}</option>)}
        </select>
      </div>

      <p className="text-[12px] text-ink-subtle mb-2">{filtered.length} zadetkov</p>
      <div className="space-y-2">
        {filtered.slice(0, shown).map((d) => (
          <button key={d.id} type="button" onClick={() => setOpenId(d.id)} className="w-full text-left">
            <Card className="p-3.5 hover:border-line-strong transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] leading-snug">{d.name}</div>
                  <div className="text-[11.5px] text-ink-subtle mt-0.5">
                    {[d.type, d.town, d.distanceKm !== null ? `${d.distanceKm} km` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge tone={STAGE_TONE[d.stage]}>{STAGE_LABEL[d.stage]}</Badge>
                  <span className="text-[11px] text-ink-subtle">
                    {TIER_LABEL[d.tier]}
                    {d.wave !== null && ` · val ${d.wave}`}
                  </span>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
      {filtered.length > shown && (
        <Button variant="secondary" className="w-full mt-3" onClick={() => setShown((n) => n + PAGE)}>
          Pokaži več ({filtered.length - shown})
        </Button>
      )}

      {open && <DrustvoDialog key={open.id} d={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

const dt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function DrustvoDialog({ d, onClose }: { d: Drustvo; onClose: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = React.useState(d.phone ?? "");
  const [contact, setContact] = React.useState(d.contactName ?? "");
  const [stage, setStage] = React.useState<DrustvoStage>(d.stage);
  const [wave, setWave] = React.useState<string>(d.wave === null ? "" : String(d.wave));
  const [nextAction, setNextAction] = React.useState(d.nextAction ?? "");
  const [nextOn, setNextOn] = React.useState(d.nextActionOn ?? "");
  const [notes, setNotes] = React.useState(d.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [thread, setThread] = React.useState<DrustvoMessage[] | null>(null);

  React.useEffect(() => {
    void loadThread(d.id).then(setThread);
  }, [d.id]);

  async function save() {
    setBusy(true);
    const r = await updateDrustvo(d.id, {
      phone: phone || null,
      contactName: contact || null,
      stage,
      wave: wave === "" ? null : Number(wave),
      nextAction: nextAction || null,
      nextActionOn: nextOn || null,
      notes: notes || null,
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Shranjeno");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={d.name}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{d.type ?? "Društvo"}</Badge>
            <Badge tone={STAGE_TONE[d.stage]}>{STAGE_LABEL[d.stage]}</Badge>
            <Badge tone="neutral">{TIER_LABEL[d.tier]}</Badge>
          </div>

          <div className="text-[13px] space-y-1.5">
            <div>
              {[d.town, d.region].filter(Boolean).join(", ")}
              {d.distanceKm !== null && ` · ${d.distanceKm} km (${d.distanceBand})`}
            </div>
            <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 text-wine break-all">
              <Mail className="size-4 shrink-0" /> {d.email}
            </a>
            {d.emailAlt && <div className="text-ink-muted">Drug naslov: {d.emailAlt}</div>}
            {d.emailCheck && <div className="text-ink-muted">Preverjen naslov: {EMAIL_CHECK_LABEL[d.emailCheck] ?? d.emailCheck}</div>}
            <div className="text-ink-muted">
              Aktivnost: {ACTIVITY_LABEL[d.activityLevel ?? "unknown"]}
              {d.organizesTrips === "yes" && " · organizira izlete"}
              {d.organizesTrips === "no" && " · ne organizira izletov"}
            </div>
            {d.activityNote && <div className="text-ink-muted leading-relaxed">{d.activityNote}</div>}
            <div className="flex gap-3">
              {d.website && (
                <a href={d.website.startsWith("http") ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wine">
                  Spletna stran <ExternalLink className="size-3.5" />
                </a>
              )}
              {d.sourceUrl && d.sourceUrl !== d.website && (
                <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wine">
                  Vir <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <FieldLabel>Stanje</FieldLabel>
              <select className={`${selectCls} w-full h-11`} value={stage} onChange={(e) => setStage(e.target.value as DrustvoStage)}>
                {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Telefon</FieldLabel>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+386…" />
              </div>
              <div>
                <FieldLabel>Kontaktna oseba</FieldLabel>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel>Val pošiljanja</FieldLabel>
              <select className={`${selectCls} w-full h-11`} value={wave} onChange={(e) => setWave(e.target.value)}>
                <option value="">Brez vala</option>
                {[0, 1, 2, 3, 4].map((w) => <option key={w} value={String(w)}>Val {w}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <div>
                <FieldLabel>Naslednji korak</FieldLabel>
                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="npr. poklicati pred občnim zborom" />
              </div>
              <div>
                <FieldLabel>Do</FieldLabel>
                <Input type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel>Opombe</FieldLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button size="lg" onClick={() => void save()} loading={busy}>Shrani</Button>
          </div>

          <div>
            <FieldLabel>Pogovor</FieldLabel>
            {thread === null && <p className="text-[12.5px] text-ink-subtle">Nalaganje…</p>}
            {thread !== null && thread.length === 0 && <p className="text-[12.5px] text-ink-subtle">Še ni sporočil.</p>}
            <div className="space-y-2">
              {(thread ?? []).map((m) => (
                <div key={m.id} className={`rounded-[12px] p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap ${m.direction === "in" ? "bg-wine-soft" : "bg-surface-muted"}`}>
                  <div className="text-[11px] text-ink-subtle mb-1">
                    {m.direction === "in" ? "Od društva" : "Mi"}
                    {m.occurredAt && ` · ${dt.format(new Date(m.occurredAt))}`}
                  </div>
                  {m.subject && <div className="font-semibold">{m.subject}</div>}
                  {m.body}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
