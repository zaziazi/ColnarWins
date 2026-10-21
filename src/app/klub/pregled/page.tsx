import Link from "next/link";
import { Printer, QrCode } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { clubPublicUrl, getClubSettings, getClubStats, SLIPPING_DAYS } from "@/lib/club";
import { requireClubManager } from "../gate";
import { ClubSettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Ljubljana" });

export default async function KlubOverview() {
  const gate = await requireClubManager();
  if ("denied" in gate) return gate.denied;
  const { staff } = gate;

  const settings = await getClubSettings();
  const s = await getClubStats(settings);
  const max = Math.max(1, ...s.weekly.map((w) => w.visits));
  const trend = s.visitsLastMonth > 0 ? Math.round(((s.visitsThisMonth - s.visitsLastMonth) / s.visitsLastMonth) * 100) : null;
  const returningPct = s.members > 0 ? Math.round((s.returning / s.members) * 100) : 0;

  return (
    <AppShell title="Pregled kluba" subtitle={settings.clubName} who={staff.fullName} role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied} section="klub" wide>
      <div className="space-y-5">
        <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
          <Tile label="Člani" value={s.members} hint={`+${s.newThisMonth} ta mesec`} />
          <Tile label="Aktivni (60 dni)" value={s.active60} hint={s.members ? `${Math.round((s.active60 / s.members) * 100)} % članov` : "—"} />
          <Tile
            label="Obiski ta mesec"
            value={s.visitsThisMonth}
            hint={trend === null ? `prejšnji: ${s.visitsLastMonth}` : `${trend >= 0 ? "+" : ""}${trend} % glede na prejšnji mesec`}
          />
          <Tile label="Se vračajo" value={s.returning} hint={`${returningPct} % je prišlo 2× ali večkrat`} />
          <Tile label="Nagrade na voljo" value={s.rewardsReady} hint="čakajo na unovčenje" />
          <Tile label="Unovčene nagrade" value={s.rewardsRedeemed} hint={settings.reward} />
          <Tile label="Soglasje za novice" value={s.marketing} hint="lahko jim pišete" />
          <Card className="p-4 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">QR za pult</div>
            <Link href="/klub/plakat" className="inline-flex items-center gap-1.5 text-wine font-semibold text-[14px]">
              <Printer className="size-4" /> Natisni plakat
            </Link>
            <a href={`${clubPublicUrl()}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink-muted text-[12.5px]">
              <QrCode className="size-3.5" /> Stran za prijavo
            </a>
          </Card>
        </div>

        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-3">Obiski po tednih (zadnjih 12)</div>
          <div className="flex items-end gap-1.5 h-36">
            {s.weekly.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10.5px] tabular text-ink-muted">{w.visits || ""}</span>
                <div className="w-full rounded-t-[4px] bg-wine" style={{ height: `${(w.visits / max) * 100}%`, minHeight: w.visits ? 3 : 0 }} />
                <span className="text-[9.5px] text-ink-subtle whitespace-nowrap">{w.week}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid min-[900px]:grid-cols-2 gap-4 items-start">
          <Card className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">Stalni gostje, ki jih ni več</div>
            <p className="text-[12.5px] text-ink-muted mt-1">
              Prišli so vsaj 2×, zadnjih {SLIPPING_DAYS} dni pa ne. Povabite jih nazaj v Sporočilih.
            </p>
            {s.slipping.length === 0 ? (
              <p className="text-[13px] text-ink-subtle mt-3">Nihče – odlično.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {s.slipping.map((m) => (
                  <li key={m.id} className="py-2 flex justify-between gap-3 text-[13.5px]">
                    <span className="font-semibold truncate">{m.name}</span>
                    <span className="text-ink-subtle tabular shrink-0">
                      {m.visits}× · {m.lastVisitAt ? dayFmt.format(new Date(m.lastVisitAt)) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-3">Pravila kluba</div>
            <ClubSettingsForm settings={settings} />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">{label}</div>
      <div className="text-[28px] font-bold tabular leading-tight mt-1">{value}</div>
      <div className="text-[12px] text-ink-muted mt-0.5 truncate">{hint}</div>
    </Card>
  );
}
