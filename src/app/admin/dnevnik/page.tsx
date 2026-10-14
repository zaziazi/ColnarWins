import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AUDIT_TABLE_LABEL, getAuditLog } from "@/lib/audit";
import { getCurrentStaff } from "@/lib/data";
import { NoAccess } from "../gate";
import { AuditFilters } from "./filters";

export const dynamic = "force-dynamic";

const ACTION: Record<string, { label: string; tone: "good" | "warn" | "danger" }> = {
  insert: { label: "Dodano", tone: "good" },
  update: { label: "Spremenjeno", tone: "warn" },
  delete: { label: "Izbrisano", tone: "danger" },
};

const dt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ t?: string; u?: string; p?: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || !staff.isAdmin) return <NoAccess />;

  const sp = await searchParams;
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const { entries, hasMore, actors } = await getAuditLog({ table: sp.t || undefined, actor: sp.u || undefined, page });

  const link = (p: number) => {
    const q = new URLSearchParams();
    if (sp.t) q.set("t", sp.t);
    if (sp.u) q.set("u", sp.u);
    if (p > 0) q.set("p", String(p));
    const s = q.toString();
    return `/admin/dnevnik${s ? `?${s}` : ""}`;
  };

  return (
    <AppShell
      title="Dnevnik sprememb"
      subtitle="Kdo je kaj spremenil. Vidiš samo ti."
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      isAdmin={staff.isAdmin} denied={staff.denied}
      section="admin"
    >
      <AuditFilters
        tables={Object.entries(AUDIT_TABLE_LABEL).map(([value, label]) => ({ value, label }))}
        actors={actors}
        table={sp.t ?? ""}
        actor={sp.u ?? ""}
      />

      {entries.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13px] text-ink-muted">Ni zapisov za izbrane filtre.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">
                    {e.actorName} <span className="font-normal text-ink-muted">· {dt.format(new Date(e.at))}</span>
                  </p>
                  <p className="text-[12.5px] text-ink-muted mt-0.5">
                    {e.tableLabel}
                    {e.label && <span className="font-semibold text-ink"> · {e.label}</span>}
                  </p>
                </div>
                <Badge tone={ACTION[e.action].tone}>{ACTION[e.action].label}</Badge>
              </div>
              {e.lines.length > 0 && (
                <ul className="mt-1.5 text-[12px] text-ink-muted space-y-0.5">
                  {e.lines.map((l, i) => (
                    <li key={i} className="break-words">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-4 text-[13px] font-semibold">
        {page > 0 ? (
          <Link href={link(page - 1)} className="text-wine">
            ← Novejše
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={link(page + 1)} className="text-wine">
            Starejše →
          </Link>
        )}
      </div>
    </AppShell>
  );
}
