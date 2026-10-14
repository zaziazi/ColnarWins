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
import { addStaff, addStaffWithLogin, createLogin, linkLogin, resetPassword, unlinkLogin, updateStaff } from "./actions";

export const ROLE_INFO: Record<StaffRole, { label: string; sees: string }> = {
  manager: { label: "Vodja", sees: "Vse: pregled, naročila, prodaja, degustacije, klet, zaloge in finance. Admin samo skrbnik." },
  office: { label: "Pisarna", sees: "Naročila: vnos, potrjevanje dni dostave, tisk in dostava." },
  driver: { label: "Voznik", sees: "Naročila: današnja dostava (prečrtavanje dostavljenega), tisk in vnos." },
  sales: { label: "Prodaja", sees: "Prodaja (zemljevid, načrt, na terenu, vino v avtu), Degustacije in Dostava." },
  events: { label: "Degustacije", sees: "Naročila in Degustacije (odgovori, koledar, nova degustacija)." },
};

/** Readable temporary password (no look-alike characters). */
function makePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

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
        Prijava je uporabniško ime in začasno geslo, ki ga izbereš tukaj. Ob prvi prijavi mora sodelavec geslo zamenjati. Sodelavec
        brez prijave (npr. voznik, ki mu samo dodeljuješ delo) se doda brez uporabniškega imena.
      </p>
    </div>
  );
}

function MemberCard({ m, isMe }: { m: StaffMember; isMe: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = React.useState(m.phone ?? "");
  const [busy, setBusy] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [loginEmail, setLoginEmail] = React.useState("");
  const [panel, setPanel] = React.useState<"create" | "reset" | null>(null);
  const [username, setUsername] = React.useState("");
  const [tempPassword, setTempPassword] = React.useState("");

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
          <div className="text-[12px] text-ink-subtle truncate">{m.username ? `uporabniško ime: ${m.username}` : (m.email ?? "brez prijave")}</div>
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
      <label className="mt-2 flex items-center gap-2 text-[13px] font-semibold">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-wine)]"
          checked={m.delivers}
          disabled={busy}
          onChange={(e) => void save({ delivers: e.target.checked }, e.target.checked ? "Dostavlja" : "Ne dostavlja več")}
        />
        Dostavlja (na seznamu voznikov, dobi obvestilo ob 17:00)
      </label>
      <label className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-wine)]"
          checked={m.notifyPrint}
          disabled={busy}
          onChange={(e) => void save({ notifyPrint: e.target.checked }, e.target.checked ? "Dobi obvestilo za tisk" : "Obvestila za tisk izklopljena")}
        />
        Obvestilo, ko je dan potrjen za tisk
      </label>
      {m.role === "manager" && (
        <div className="mt-2">
          <p className="text-[12px] text-ink-subtle mb-1">Brez dostopa do:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(["klet", "zaloge", "finance"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-wine)]"
                  checked={m.denied.includes(s)}
                  disabled={busy}
                  onChange={(e) =>
                    void save(
                      {
                        denied: (e.target.checked ? [...m.denied, s] : m.denied.filter((x) => x !== s)) as ("klet" | "zaloge" | "finance")[],
                      },
                      "Dostop spremenjen",
                    )
                  }
                />
                {s === "klet" ? "Klet" : s === "zaloge" ? "Zaloge" : "Finance"}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save({ active: !m.active }, m.active ? "Deaktivirano" : "Aktivirano")}>
          {m.active ? "Deaktiviraj" : "Aktiviraj"}
        </Button>
        {!m.hasLogin && panel !== "create" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setUsername(m.fullName.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, ""));
              setTempPassword(makePassword());
              setPanel("create");
            }}
          >
            Ustvari prijavo
          </Button>
        )}
        {m.hasLogin && !isMe && panel !== "reset" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setTempPassword(makePassword());
              setPanel("reset");
            }}
          >
            Ponastavi geslo
          </Button>
        )}
        {!m.hasLogin && !linking && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setLinking(true)}>
            Poveži obstoječo e-pošto
          </Button>
        )}
        {m.hasLogin && !isMe && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Odvezati prijavo od ${m.fullName}? Njegovi podatki ostanejo.`)) return;
              setBusy(true);
              const r = await unlinkLogin(m.id);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Prijava odvezana");
              router.refresh();
            }}
          >
            Odveži prijavo
          </Button>
        )}
      </div>
      {panel && (
        <div className="mt-2 rounded-[12px] border border-line p-3 space-y-2">
          {panel === "create" && (
            <>
              <FieldLabel className="mb-0">Uporabniško ime</FieldLabel>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="npr. janez" />
            </>
          )}
          <FieldLabel className="mb-0">Začasno geslo</FieldLabel>
          <div className="flex gap-2">
            <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" />
            <Button size="sm" variant="secondary" className="shrink-0 h-11" onClick={() => setTempPassword(makePassword())}>
              Novo
            </Button>
          </div>
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Sporoči mu uporabniško ime in to geslo. Ob prvi prijavi bo moral izbrati svoje geslo, ki ga ne poznaš ne ti ne aplikacija.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = panel === "create" ? await createLogin(m.id, username, tempPassword) : await resetPassword(m.id, tempPassword);
                setBusy(false);
                if (!r.ok) return void toast.error(r.error);
                toast.success(panel === "create" ? "Prijava ustvarjena" : "Geslo ponastavljeno");
                setTempPassword(""); // the temporary password is not kept on screen after saving
                setPanel(null);
                router.refresh();
              }}
            >
              {panel === "create" ? "Ustvari" : "Ponastavi"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Prekliči
            </Button>
          </div>
        </div>
      )}
      {linking && (
        <div className="mt-2 rounded-[12px] border border-line p-3 space-y-2">
          <p className="text-[12px] text-ink-muted leading-relaxed">E-pošta prijave, ki že obstaja v Supabase (Authentication → Users).</p>
          <Input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="ime@primer.si" inputMode="email" />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await linkLogin(m.id, loginEmail);
                setBusy(false);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Prijava povezana");
                setLinking(false);
                router.refresh();
              }}
            >
              Poveži
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>
              Prekliči
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddMember() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<StaffRole>("driver");
  const [phone, setPhone] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
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
      <FieldLabel className="mb-0 mt-1">Prijava (neobvezno)</FieldLabel>
      <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" placeholder="Uporabniško ime, npr. janez" />
      {username.trim() && (
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="Začasno geslo" />
          <Button size="sm" variant="secondary" className="shrink-0 h-11" onClick={() => setPassword(makePassword())}>
            Ustvari
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = username.trim()
              ? await addStaffWithLogin({ fullName: name, role, phone: phone || null, username, password })
              : await addStaff({ fullName: name, role, phone: phone || null });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Dodano");
            setName("");
            setPhone("");
            setUsername("");
            setPassword("");
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
