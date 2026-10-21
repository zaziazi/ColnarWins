"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClubMember } from "@/lib/club";
import { cn } from "@/lib/utils";
import { deleteMember, saveMemberNote } from "../actions";

const dayFmt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "2-digit", timeZone: "Europe/Ljubljana" });
const d = (iso: string | null) => (iso ? dayFmt.format(new Date(iso)) : "—");

type Sort = "last" | "visits" | "new";

export function MemberList({ members, stampsNeeded }: { members: ClubMember[]; stampsNeeded: number }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("last");
  const [open, setOpen] = React.useState<string | null>(null);

  const shown = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? members.filter((m) => [m.name, m.email, m.phone ?? "", m.cardCode].some((x) => x.toLowerCase().includes(t)))
      : members;
    return [...list].sort((a, b) =>
      sort === "visits"
        ? b.visits - a.visits
        : sort === "new"
          ? b.createdAt.localeCompare(a.createdAt)
          : (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""),
    );
  }, [members, q, sort]);

  function exportCsv() {
    const rows = [
      ["Ime", "E-naslov", "Telefon", "Koda", "Žigi", "Obiski", "Nagrade", "Novice", "Član od", "Zadnji obisk"],
      ...shown.map((m) => [m.name, m.email, m.phone ?? "", m.cardCode, m.stamps, m.visits, m.rewardsRedeemed, m.marketing ? "da" : "ne", d(m.createdAt), d(m.lastVisitAt)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "klub-clani.csv";
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Išči po imenu, e-naslovu, telefonu, kodi" className="flex-1 min-w-[220px]" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-11 px-3 rounded-[var(--radius-control)] border border-line bg-surface text-[14px]"
        >
          <option value="last">Zadnji obisk</option>
          <option value="visits">Največ obiskov</option>
          <option value="new">Najnovejši člani</option>
        </select>
        <Button variant="secondary" onClick={exportCsv}>
          <Download /> CSV
        </Button>
      </div>

      {shown.length === 0 ? (
        <Card className="p-6 text-center text-[13.5px] text-ink-subtle">
          {members.length === 0 ? "Še ni članov. Natisnite plakat s QR kodo (Pregled) in ga postavite na pult." : "Ni zadetkov."}
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {shown.map((m) => (
            <div key={m.id}>
              <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="w-full text-left px-4 py-3 hover:bg-surface-muted flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14.5px] truncate flex items-center gap-1.5">
                    {m.name}
                    {m.marketing && <Mail className="size-3.5 text-ink-subtle shrink-0" aria-label="Soglasje za novice" />}
                  </div>
                  <div className="text-[12px] text-ink-subtle truncate">
                    {m.email} · {m.visits}× · zadnjič {d(m.lastVisitAt)}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold tabular",
                    m.stamps >= stampsNeeded ? "bg-warn-soft text-warn" : "bg-wine-soft text-wine",
                  )}
                >
                  {m.stamps}/{stampsNeeded}
                </span>
              </button>
              {open === m.id && <MemberDetail m={m} onChanged={() => router.refresh()} />}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function MemberDetail({ m, onChanged }: { m: ClubMember; onChanged: () => void }) {
  const [note, setNote] = React.useState(m.note ?? "");
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="px-4 pb-4 pt-1 bg-surface-muted space-y-3">
      <dl className="grid grid-cols-2 min-[600px]:grid-cols-4 gap-2 text-[12.5px]">
        <Info k="Koda" v={m.cardCode} />
        <Info k="Telefon" v={m.phone ?? "—"} />
        <Info k="Član od" v={d(m.createdAt)} />
        <Info k="Unovčene nagrade" v={String(m.rewardsRedeemed)} />
      </dl>
      <div className="flex gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opomba (npr. najljubše vino)" />
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveMemberNote(m.id, note);
            setBusy(false);
            if (r.ok) {
              toast.success("Shranjeno");
              onChanged();
            } else toast.error(r.error);
          }}
        >
          Shrani
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={async () => {
          if (!confirm(`Trajno izbrišem kartico in vse obiske za ${m.name}? (na željo gosta)`)) return;
          const r = await deleteMember(m.id);
          if (r.ok) {
            toast.success("Izbrisano");
            onChanged();
          } else toast.error(r.error);
        }}
      >
        <Trash2 /> Izbriši člana
      </Button>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-subtle">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
