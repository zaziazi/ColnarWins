"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StaffMember } from "@/lib/admin-data";
import type { StaffRole } from "@/lib/types";
import { addStaff, updateStaff } from "./actions";

export const ROLE_INFO: Record<StaffRole, { label: string; sees: string }> = {
  manager: { label: "Vodja", sees: "Vse: pregled, naročila, prodaja, degustacije, klet, zaloge, finance in admin." },
  office: { label: "Pisarna", sees: "Naročila (vnos, potrjevanje, načrt dostav)." },
  driver: { label: "Voznik", sees: "Naročila in svoja pot za danes." },
  sales: { label: "Prodaja", sees: "Naročila in Prodaja (zemljevid, načrt, na terenu, vino v avtu)." },
  events: { label: "Degustacije", sees: "Naročila in Degustacije (odgovori, koledar, nova degustacija)." },
};

const selectCls = "h-10 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px]";

export function StaffRoles({ members, meId }: { members: StaffMember[]; meId: string }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <FieldLabel>Vloge in kaj omogočajo</FieldLabel>
        <div className="space-y-2">
          {(Object.keys(ROLE_INFO) as StaffRole[]).map((r) => (
            <div key={r} className="text-[13px] leading-relaxed">
              <span className="font-bold">{ROLE_INFO[r].label}:</span> <span className="text-ink-muted">{ROLE_INFO[r].sees}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {members.map((m) => (
          <MemberCard key={m.id} m={m} isMe={m.id === meId} />
        ))}
      </div>

      <AddMember />
      <p className="text-[12px] text-ink-subtle leading-relaxed">
        Sodelavec brez prijave (npr. voznik, ki mu samo dodeljuješ delo) se lahko doda tukaj. Prijavo z e-pošto in geslom ustvariš v Supabase
        (Authentication), nato jo povežemo s sodelavcem.
      </p>
    </div>
  );
}

function MemberCard({ m, isMe }: { m: StaffMember; isMe: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = React.useState(m.phone ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save(patch: Parameters<typeof updateStaff>[1], ok = "Shranjeno") {
    setBusy(true);
    const r = await updateStaff(m.id, patch);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      router.refresh(); // put the controls back to what the database has
      return;
    }
    toast.success(ok);
    router.refresh();
  }

  return (
    <Card className={`p-4 ${m.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[15px] truncate">
            {m.fullName} {isMe && <span className="text-[11px] font-bold text-wine">· ti</span>}
          </div>
          <div className="text-[12px] text-ink-subtle truncate">{m.email ?? "brez e-pošte"}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge tone={m.hasLogin ? "good" : "neutral"}>{m.hasLogin ? "Ima prijavo" : "Brez prijave"}</Badge>
          {!m.active && <Badge tone="danger">Neaktiven</Badge>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <FieldLabel className="mb-1">Vloga</FieldLabel>
          <select
            className={`${selectCls} w-full`}
            value={m.role}
            disabled={busy}
            onChange={(e) => void save({ role: e.target.value as StaffRole }, "Vloga spremenjena")}
            aria-label={`Vloga: ${m.fullName}`}
          >
            {(Object.keys(ROLE_INFO) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel className="mb-1">Telefon</FieldLabel>
          <Input
            className="h-10"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => phone.trim() !== (m.phone ?? "") && void save({ phone })}
            placeholder="041 123 456"
          />
        </div>
      </div>
      <p className="text-[12px] text-ink-subtle mt-2">{ROLE_INFO[m.role].sees}</p>

      <div className="mt-2.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save({ active: !m.active }, m.active ? "Deaktivirano" : "Aktivirano")}>
          {m.active ? "Deaktiviraj" : "Aktiviraj"}
        </Button>
      </div>
    </Card>
  );
}

function AddMember() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<StaffRole>("driver");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Dodaj sodelavca
      </Button>
    );
  }
  return (
    <Card className="p-4 space-y-2.5">
      <FieldLabel>Nov sodelavec</FieldLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ime in priimek" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon (neobvezno)" />
      <select className={`${selectCls} w-full`} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
        {(Object.keys(ROLE_INFO) as StaffRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_INFO[r].label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await addStaff({ fullName: name, role, phone: phone || null });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Dodano");
            setName("");
            setPhone("");
            setOpen(false);
            router.refresh();
          }}
        >
          Dodaj
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Prekliči
        </Button>
      </div>
    </Card>
  );
}
