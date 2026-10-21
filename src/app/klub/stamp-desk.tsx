"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Gift, RotateCcw, Search, Stamp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClubMember, ClubSettings, ClubVisit } from "@/lib/club";
import { cn } from "@/lib/utils";
import { addStamp, findMembers, getMember, redeemReward, undoVisit } from "./actions";
import { QrScanner } from "./scanner";

const timeFmt = new Intl.DateTimeFormat("sl-SI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana" });
const dayFmt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", timeZone: "Europe/Ljubljana" });

function when(iso: string) {
  const d = new Date(iso);
  const today = dayFmt.format(new Date()) === dayFmt.format(d);
  return today ? timeFmt.format(d) : `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

export function StampDesk({
  settings,
  recent,
  isManager,
}: {
  settings: ClubSettings;
  recent: ClubVisit[];
  staffName: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [scanning, setScanning] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ClubMember[] | null>(null);
  const [member, setMember] = React.useState<ClubMember | null>(null);
  const [busy, setBusy] = React.useState(false);

  const lookup = React.useCallback(async (text: string) => {
    setBusy(true);
    const found = await findMembers(text);
    setBusy(false);
    if (found.length === 1) {
      setMember(found[0]);
      setResults(null);
    } else {
      setMember(null);
      setResults(found);
      if (found.length === 0) toast.error("Kartice ni bilo mogoče najti.");
    }
  }, []);

  const onCode = React.useCallback(
    (text: string) => {
      setScanning(false);
      void lookup(text);
    },
    [lookup],
  );
  const onError = React.useCallback((msg: string) => {
    setScanning(false);
    toast.error(msg);
  }, []);

  async function reload(id: string) {
    const m = await getMember(id);
    if (m) setMember(m);
    router.refresh();
  }

  async function stamp() {
    if (!member) return;
    setBusy(true);
    const r = await addStamp(member.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Žig dodan · ${member.name}`);
    await reload(member.id);
  }

  async function redeem() {
    if (!member) return;
    if (!confirm(`Unovčim nagrado (${settings.reward}) za ${member.name}?`)) return;
    setBusy(true);
    const r = await redeemReward(member.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Nagrada unovčena 🎉");
    await reload(member.id);
  }

  async function undo(v: ClubVisit) {
    if (!confirm(`Razveljavim ${v.kind === "stamp" ? "žig" : "nagrado"} za ${v.memberName}?`)) return;
    const r = await undoVisit(v.id);
    if (!r.ok) return toast.error(r.error);
    toast.success("Razveljavljeno");
    if (member?.id === v.memberId) await reload(v.memberId);
    else router.refresh();
  }

  function reset() {
    setMember(null);
    setResults(null);
    setQuery("");
  }

  const ready = member ? member.stamps >= settings.stampsNeeded : false;
  const stampedToday = member?.lastVisitAt ? dayFmt.format(new Date(member.lastVisitAt)) === dayFmt.format(new Date()) : false;

  return (
    <div className="space-y-4 min-[900px]:max-w-[560px]">
      {!member && (
        <>
          {scanning ? (
            <div className="space-y-2">
              <QrScanner onCode={onCode} onError={onError} />
              <Button variant="secondary" className="w-full" onClick={() => setScanning(false)}>
                <X /> Prekliči
              </Button>
            </div>
          ) : (
            <Button size="lg" onClick={() => setScanning(true)} className="h-16 text-[17px]">
              <Camera className="!size-5" /> Skeniraj kartico gosta
            </Button>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(query);
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Koda kartice, ime, e-naslov ali telefon" />
            <Button type="submit" variant="secondary" size="icon" loading={busy} aria-label="Išči">
              <Search />
            </Button>
          </form>

          {results && results.length > 1 && (
            <Card className="divide-y divide-line">
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => setMember(m)} className="w-full text-left px-4 py-3 hover:bg-surface-muted">
                  <div className="font-semibold text-[14.5px]">{m.name}</div>
                  <div className="text-[12px] text-ink-subtle">
                    {m.cardCode} · {m.email} · {m.stamps}/{settings.stampsNeeded}
                  </div>
                </button>
              ))}
            </Card>
          )}
        </>
      )}

      {member && (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[19px] font-bold leading-tight">{member.name}</div>
              <div className="text-[12.5px] text-ink-subtle mt-0.5">
                {member.cardCode} · {member.visits} {member.visits === 1 ? "obisk" : "obiskov"}
                {member.lastVisitAt ? ` · zadnjič ${when(member.lastVisitAt)}` : ""}
              </div>
              {member.note && <div className="text-[12.5px] text-ink-muted mt-1">📝 {member.note}</div>}
            </div>
            <Button variant="ghost" size="icon" aria-label="Zapri" onClick={reset}>
              <X />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {Array.from({ length: settings.stampsNeeded }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-full grid place-items-center text-[12px] font-bold",
                  i < member.stamps ? "bg-wine text-white" : "border-2 border-dashed border-line-strong text-ink-subtle",
                )}
              >
                {i < member.stamps ? <Stamp className="size-4" /> : i + 1}
              </div>
            ))}
          </div>
          {member.stamps > settings.stampsNeeded && (
            <p className="text-[12px] text-ink-subtle mt-2">+{member.stamps - settings.stampsNeeded} žigov v rezervi</p>
          )}

          {ready && (
            <div className="mt-4 rounded-[12px] bg-warn-soft text-warn px-3.5 py-3 text-[13.5px] font-semibold flex items-center gap-2">
              <Gift className="size-4 shrink-0" /> Nagrada je na voljo: {settings.reward}
            </div>
          )}

          <div className="mt-4 grid gap-2">
            <Button size="lg" onClick={stamp} loading={busy} disabled={stampedToday}>
              <Stamp /> {stampedToday ? "Danes že ima žig" : "Dodaj žig"}
            </Button>
            {ready && (
              <Button size="lg" variant="secondary" onClick={redeem} disabled={busy}>
                <Gift /> Unovči nagrado
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Naslednji gost
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-2">
          {isManager ? "Zadnji žigi" : "Moji zadnji žigi"}
        </h2>
        {recent.length === 0 ? (
          <Card className="p-4 text-[13px] text-ink-subtle">Še ni žigov.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {recent.map((v) => {
              const fresh = Date.now() - new Date(v.createdAt).getTime() < 15 * 60_000;
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn("grid place-items-center size-8 rounded-full", v.kind === "stamp" ? "bg-wine-soft text-wine" : "bg-warn-soft text-warn")}>
                    {v.kind === "stamp" ? <Stamp className="size-4" /> : <Gift className="size-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{v.memberName}</div>
                    <div className="text-[11.5px] text-ink-subtle">
                      {v.kind === "stamp" ? "Žig" : "Nagrada"} · {when(v.createdAt)}
                      {isManager && v.staffName ? ` · ${v.staffName}` : ""}
                    </div>
                  </div>
                  {(fresh || isManager) && (
                    <Button variant="ghost" size="sm" onClick={() => void undo(v)} aria-label="Razveljavi">
                      <RotateCcw />
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
