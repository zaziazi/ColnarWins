"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClubSettings } from "@/lib/club";
import { saveClubSettings } from "../actions";

export function ClubSettingsForm({ settings }: { settings: ClubSettings }) {
  const [s, setS] = React.useState(settings);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await saveClubSettings(s);
    setBusy(false);
    if (r.ok) toast.success("Shranjeno");
    else toast.error(r.error);
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-ink-muted">Ime kluba</span>
        <Input className="mt-1" value={s.clubName} onChange={(e) => setS({ ...s, clubName: e.target.value })} />
      </label>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <label className="block">
          <span className="text-[12.5px] font-semibold text-ink-muted">Žigov za nagrado</span>
          <Input
            className="mt-1"
            type="number"
            min={3}
            max={30}
            value={s.stampsNeeded}
            onChange={(e) => setS({ ...s, stampsNeeded: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold text-ink-muted">Nagrada</span>
          <Input className="mt-1" value={s.reward} onChange={(e) => setS({ ...s, reward: e.target.value })} />
        </label>
      </div>
      <p className="text-[12px] text-ink-subtle">En žig na obisk, največ enkrat na dan. Sprememba velja takoj za vse kartice.</p>
      <Button type="submit" variant="secondary" loading={busy}>
        Shrani pravila
      </Button>
    </form>
  );
}
