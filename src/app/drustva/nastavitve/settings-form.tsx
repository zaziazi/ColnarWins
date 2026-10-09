"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { DrustvaSettings } from "@/lib/types";
import { saveSettings } from "../actions";
import { WEEKDAYS } from "../constants";

export function SettingsForm({ settings, people }: { settings: DrustvaSettings; people: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [info, setInfo] = React.useState(settings.infoSheet);
  const [rules, setRules] = React.useState(settings.rules);
  const [maxGroups, setMaxGroups] = React.useState(String(settings.maxGroupsPerDay));
  const [days, setDays] = React.useState<number[]>(settings.hostingWeekdays);
  const [blackout, setBlackout] = React.useState<string[]>(settings.blackoutDates);
  const [newBlackout, setNewBlackout] = React.useState("");
  const [notify, setNotify] = React.useState<string[]>(settings.notifyStaffIds);
  const [busy, setBusy] = React.useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    const max = Number(maxGroups);
    if (!Number.isInteger(max) || max < 1) return void toast.error("Največ skupin na dan mora biti vsaj 1.");
    setBusy(true);
    const r = await saveSettings({ infoSheet: info, rules, maxGroupsPerDay: max, hostingWeekdays: days, blackoutDates: blackout, notifyStaffIds: notify });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Nastavitve shranjene");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <FieldLabel>Informacijski list</FieldLabel>
        <p className="text-[12.5px] text-ink-muted leading-relaxed">
          Tole prebere umetna inteligenca pred vsakim osnutkom odgovora, zato naj bo vse na enem mestu: kaj obisk vključuje, trajanje,
          cena na osebo in kaj je brezplačno, hrana, velikost skupine, parkiranje za avtobuse, stopnice in dostopnost, naslov, kako
          rezervirati, telefon ter 10–15 pogostih vprašanj z odgovori.
        </p>
        <Textarea className="min-h-[220px]" value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Piši v slovenščini." />
      </Card>

      <Card className="p-4 space-y-2">
        <FieldLabel>Pravila za osnutke</FieldLabel>
        <Textarea className="min-h-[220px]" value={rules} onChange={(e) => setRules(e.target.value)} />
      </Card>

      <Card className="p-4 space-y-3">
        <FieldLabel>Kapaciteta</FieldLabel>
        <div>
          <div className="text-[12.5px] text-ink-muted mb-1.5">Dnevi, ko sprejemamo skupine</div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <button
                key={w}
                type="button"
                onClick={() => setDays(toggle(days, i + 1))}
                aria-pressed={days.includes(i + 1)}
                className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border ${days.includes(i + 1) ? "bg-wine text-white border-wine" : "bg-surface text-ink-muted border-line"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12.5px] text-ink-muted mb-1.5">Največ skupin na dan</div>
          <Input inputMode="numeric" value={maxGroups} onChange={(e) => setMaxGroups(e.target.value)} className="w-24" />
        </div>
        <div>
          <div className="text-[12.5px] text-ink-muted mb-1.5">Blokirani datumi (praznik, trgatev, dopust)</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {blackout.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 h-8 pl-3 pr-2 rounded-full bg-surface-muted text-[12.5px]">
                {d}
                <button type="button" aria-label="Odstrani" onClick={() => setBlackout(blackout.filter((x) => x !== d))}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input type="date" value={newBlackout} onChange={(e) => setNewBlackout(e.target.value)} className="h-10" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (newBlackout && !blackout.includes(newBlackout)) setBlackout([...blackout, newBlackout].sort());
                setNewBlackout("");
              }}
            >
              Dodaj
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <FieldLabel>Kdo dobi obvestila</FieldLabel>
        <p className="text-[12.5px] text-ink-muted">Če ne izbereš nikogar, obvestila dobijo vsi vodje.</p>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" className="size-4 accent-[var(--color-wine)]" checked={notify.includes(p.id)} onChange={() => setNotify(toggle(notify, p.id))} />
            {p.name} <span className="text-[12px] text-ink-subtle">({p.role})</span>
          </label>
        ))}
      </Card>

      <Button size="lg" onClick={() => void save()} loading={busy}>Shrani nastavitve</Button>
    </div>
  );
}
