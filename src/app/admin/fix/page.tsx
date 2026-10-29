import Link from "next/link";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { getFixes, KIND_LABEL, type FixStatus } from "@/lib/fix";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { NoAccess } from "../gate";
import { FixRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

const TABS: { key: FixStatus | "all"; label: string }[] = [
  { key: "new", label: "Nove" },
  { key: "done", label: "Rešene" },
  { key: "all", label: "Vse" },
];

/** What the team reported with the FIX button. Download as a file and paste it to Claude Code. */
export default async function FixPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || !staff.isAdmin) return <NoAccess />;

  const sp = await searchParams;
  const status: FixStatus | "all" = sp.s === "done" ? "done" : sp.s === "all" ? "all" : "new";
  const supabase = await createClient();
  const [rows, all] = await Promise.all([getFixes(supabase, status), getFixes(supabase, "all")]);
  const counts = { new: all.filter((r) => r.status === "new").length, done: all.filter((r) => r.status === "done").length, all: all.length };

  return (
    <AppShell
      title="FIX 🔧 predlogi"
      subtitle="Kar je ekipa javila iz aplikacije"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="admin"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/fix?s=${t.key}`}
            className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1.5", status === t.key ? "bg-wine text-white border-wine" : "bg-surface border-line text-ink-muted")}
          >
            {t.label} <span className="opacity-70">{counts[t.key]}</span>
          </Link>
        ))}
      </div>

      <Card className="p-3.5 mb-4">
        <p className="text-[12.5px] text-ink-muted mb-2.5 leading-relaxed">
          Prenesi seznam kot datoteko in mi ga pošlji. Datoteka je pripravljena tako, da jo samo prilepiš ali naložiš v pogovor in skupaj popraviva.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/fix-export?s=new" download className="h-9 px-3.5 rounded-full text-[13px] font-semibold bg-wine text-white inline-flex items-center gap-1.5">
            <Download className="size-4" /> Prenesi nove ({counts.new})
          </a>
          <a href="/api/fix-export?s=all" download className="h-9 px-3.5 rounded-full text-[13px] font-semibold border border-line bg-surface text-ink-muted inline-flex items-center gap-1.5">
            <Download className="size-4" /> Prenesi vse ({counts.all})
          </a>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">{status === "new" ? "Ni novih predlogov. Gumb FIX 🔧 je na vsaki strani zgoraj." : "Ni predlogov v tem pogledu."}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">
                    {r.staffName}
                    {r.staffRole && <span className="font-normal text-ink-subtle"> · {r.staffRole}</span>}
                  </p>
                  <p className="text-[11.5px] text-ink-subtle mt-0.5">
                    {when.format(new Date(r.createdAt))} · {r.pagePath ?? "?"}
                    {r.device ? ` · ${r.device}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={r.kind === "problem" ? "danger" : "info"}>{KIND_LABEL[r.kind]}</Badge>
                  {r.status === "done" && <Badge tone="good">Rešeno</Badge>}
                </div>
              </div>
              <p className="text-[14px] mt-2.5 whitespace-pre-wrap">{r.message}</p>
              <div className="mt-3">
                <FixRowActions id={r.id} status={r.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
