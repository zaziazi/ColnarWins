"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ClubMember } from "@/lib/club";
import { getMemberQr, newCardCode, updateMember } from "../actions";

/** The guest's QR as on their card — scan it at the till, or send them the card link again. */
export function QrDialog({ m, open, onOpenChange, onChanged }: { m: ClubMember; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [data, setData] = React.useState<{ qr: string; code: string; cardUrl: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setData(null);
    getMemberQr(m.id).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [open, m.id]);

  async function regenerate() {
    if (!confirm(`Nova koda za ${m.name}? Stara QR koda ne bo več delovala. Povezava do kartice ostane ista, gost samo osveži kartico.`)) return;
    setBusy(true);
    const r = await newCardCode(m.id);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Nova koda: ${r.code}`);
    setData(await getMemberQr(m.id));
    onChanged();
  }

  async function share() {
    if (!data) return;
    const text = `Vaša kartica zvestobe Vinoteke Colnar: ${data.cardUrl}`;
    if (navigator.share) {
      await navigator.share({ title: "Kartica zvestobe", text, url: data.cardUrl }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(data.cardUrl);
      toast.success("Povezava kopirana");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={m.name}>
        {!data ? (
          <p className="text-[13px] text-ink-subtle py-10 text-center">Nalagam …</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-center">
              <div className="mx-auto w-[240px] [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: data.qr }} />
              <div className="mt-2 text-[17px] font-bold tracking-[0.14em] tabular">{data.code}</div>
              <div className="text-[12px] text-ink-subtle">Skenirajte na zaslonu Žig</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void share()}>
                <Share2 /> Pošlji povezavo
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(data.cardUrl);
                  toast.success("Povezava kopirana");
                }}
              >
                <Copy /> Kopiraj
              </Button>
              <Button variant="secondary" asChild>
                <a href={data.cardUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> Odpri kartico
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href={`mailto:${m.email}?subject=${encodeURIComponent("Vaša kartica zvestobe")}&body=${encodeURIComponent(`Pozdravljeni!\n\nVaša kartica zvestobe Vinoteke Colnar: ${data.cardUrl}\n\nLep pozdrav`)}`}>
                  <Mail /> E-pošta
                </a>
              </Button>
            </div>

            <div className="border-t border-line pt-3">
              <Button variant="ghost" size="sm" onClick={() => void regenerate()} loading={busy}>
                <RefreshCw /> Nova koda (izgubljena ali deljena kartica)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Correct a member's details and stamp count. Every change lands in Admin → Dnevnik. */
export function EditDialog({ m, open, onOpenChange, onChanged }: { m: ClubMember; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [v, setV] = React.useState({ name: m.name, email: m.email, phone: m.phone ?? "", marketing: m.marketing, stamps: m.stamps });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setV({ name: m.name, email: m.email, phone: m.phone ?? "", marketing: m.marketing, stamps: m.stamps });
  }, [open, m]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await updateMember(m.id, v);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Shranjeno");
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Uredi člana">
        <form onSubmit={save} className="space-y-3">
          <Field label="Ime in priimek">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
          </Field>
          <Field label="E-naslov">
            <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required />
          </Field>
          <Field label="Telefon">
            <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field label="Žigi na kartici">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="icon" onClick={() => setV({ ...v, stamps: Math.max(0, v.stamps - 1) })} aria-label="Manj">
                −
              </Button>
              <Input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                className="text-center w-20"
                value={v.stamps}
                onChange={(e) => setV({ ...v, stamps: Math.max(0, Number(e.target.value) || 0) })}
              />
              <Button type="button" variant="secondary" size="icon" onClick={() => setV({ ...v, stamps: v.stamps + 1 })} aria-label="Več">
                +
              </Button>
            </div>
            <p className="text-[11.5px] text-ink-subtle mt-1">Za popravke. Običajni žig dodajte na zaslonu Žig, da se šteje kot obisk.</p>
          </Field>
          <label className="flex items-start gap-2.5 text-[13.5px] leading-snug">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-[var(--color-wine)]"
              checked={v.marketing}
              onChange={(e) => setV({ ...v, marketing: e.target.checked })}
            />
            <span>Prejema novice (samo če je gost to izrecno želel)</span>
          </label>
          <Button type="submit" size="lg" loading={busy}>
            Shrani
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-ink-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
