"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { DegustacijaPerson, DrustvaSettings } from "@/lib/types";
import { deletePerson, savePerson, saveSettings } from "../actions";
import { WEEKDAYS } from "../constants";

export function SettingsForm({
  settings,
  people,
  persons,
}: {
  settings: DrustvaSettings;
  people: { id: string; name: string; role: string }[];
  persons: DegustacijaPerson[];
}) {
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
      <PersonsCard persons={persons} />

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

const selectCls = "h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px]";
const ROLE_LABEL = { presenter: "Voditelj degustacij", kitchen: "Hrana / kruh", both: "Voditelj in hrana" } as const;

/** The people who receive the day-before messages: presenters and whoever prepares the bread / food. */
function PersonsCard({ persons }: { persons: DegustacijaPerson[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<(Partial<DegustacijaPerson> & { name: string }) | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const r = await savePerson({
      id: editing.id,
      name: editing.name,
      phone: editing.phone ?? null,
      role: editing.role ?? "presenter",
      channel: editing.channel ?? "whatsapp",
      isDefaultKitchen: Boolean(editing.isDefaultKitchen),
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Shranjeno");
    setEditing(null);
    router.refresh();
  }

  return (
    <Card className="p-4 space-y-3">
      <FieldLabel>Osebe, ki dobijo sporočila</FieldLabel>
      <p className="text-[12.5px] text-ink-muted leading-relaxed">
        Voditelj degustacije dobi dan prej podrobnosti skupine, oseba za hrano (običajno Katarina) pa obvestilo, kdaj in za koliko oseb naj pripravi kruh.
        Sporočilo gre po SMS ali WhatsAppu.
      </p>
      {persons.length === 0 && <p className="text-[13px] text-ink-subtle">Še ni oseb.</p>}
      {persons.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-line p-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate">
              {p.name} {p.isDefaultKitchen && <span className="text-[11px] font-bold text-wine">· privzeta za hrano</span>}
            </div>
            <div className="text-[12px] text-ink-subtle">
              {ROLE_LABEL[p.role]} · {p.phone ?? "brez telefona"} · {p.channel === "whatsapp" ? "WhatsApp" : "SMS"}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Uredi</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!window.confirm(`Odstraniti ${p.name}?`)) return;
                const r = await deletePerson(p.id);
                if (!r.ok) return void toast.error(r.error);
                router.refresh();
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      {editing ? (
        <div className="rounded-[12px] border border-line p-3 space-y-2.5">
          <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ime" />
          <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="Telefon (npr. 041 123 456)" />
          <select className={selectCls} value={editing.role ?? "presenter"} onChange={(e) => setEditing({ ...editing, role: e.target.value as DegustacijaPerson["role"] })}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={selectCls} value={editing.channel ?? "whatsapp"} onChange={(e) => setEditing({ ...editing, channel: e.target.value as DegustacijaPerson["channel"] })}>
            <option value="whatsapp">Sporočilo po WhatsAppu</option>
            <option value="sms">Sporočilo po SMS</option>
          </select>
          {(editing.role === "kitchen" || editing.role === "both") && (
            <label className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" className="size-4 accent-[var(--color-wine)]" checked={Boolean(editing.isDefaultKitchen)} onChange={(e) => setEditing({ ...editing, isDefaultKitchen: e.target.checked })} />
              Privzeta oseba za hrano (izbrana pri novih degustacijah)
            </label>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} loading={busy}>Shrani</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Prekliči</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setEditing({ name: "", role: "presenter", channel: "whatsapp", isDefaultKitchen: false })}>
          Dodaj osebo
        </Button>
      )}
    </Card>
  );
}
