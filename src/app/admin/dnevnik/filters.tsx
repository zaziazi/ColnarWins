"use client";

import { useRouter } from "next/navigation";

const selectCls = "h-10 flex-1 min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px]";

export function AuditFilters({
  tables,
  actors,
  table,
  actor,
}: {
  tables: { value: string; label: string }[];
  actors: string[];
  table: string;
  actor: string;
}) {
  const router = useRouter();
  function go(next: { t?: string; u?: string }) {
    const q = new URLSearchParams();
    const t = next.t ?? table;
    const u = next.u ?? actor;
    if (t) q.set("t", t);
    if (u) q.set("u", u);
    router.push(`/admin/dnevnik${q.toString() ? `?${q}` : ""}`);
  }
  return (
    <div className="flex gap-2 mb-3">
      <select className={selectCls} value={actor} onChange={(e) => go({ u: e.target.value })} aria-label="Oseba">
        <option value="">Vsi</option>
        {actors.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select className={selectCls} value={table} onChange={(e) => go({ t: e.target.value })} aria-label="Kaj">
        <option value="">Vse</option>
        {tables.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
