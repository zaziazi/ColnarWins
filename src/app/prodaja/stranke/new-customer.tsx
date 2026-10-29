"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createCustomer } from "./actions";

const EMPTY = { name: "", firstName: "", lastName: "", vatId: "", address: "", postCode: "", city: "", phone: "", email: "", contactName: "", notes: "" };

/** "Nova stranka": a restaurant, bar, shop… or a private person. Belongs to the salesperson who adds it (or to the one a manager picks). */
export function NewCustomerButton({ repId, repName, className }: { repId?: string; repName?: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"company" | "person">("company");
  const [f, setF] = React.useState(EMPTY);
  const [busy, startTransition] = React.useTransition();
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function save() {
    startTransition(async () => {
      const r = await createCustomer({ kind, ...f, repId: repId ?? null });
      if (!r.ok) return void toast.error(r.error);
      toast.success(repName ? `${r.name} je zdaj stranka: ${repName}` : `Stranka ${r.name} je dodana.`);
      setF(EMPTY);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("h-9 px-3.5 rounded-full text-[13px] font-semibold bg-wine text-white hover:bg-wine-hover transition-colors inline-flex items-center gap-1.5", className)}
      >
        <Plus className="size-4" /> Nova stranka
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={repName ? `Nova stranka za ${repName}` : "Nova stranka"}>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              {([["company", "Podjetje / lokal"], ["person", "Fizična oseba"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn("h-10 rounded-[var(--radius-control)] border text-[13px] font-semibold transition-colors", kind === k ? "border-wine bg-wine-soft text-wine" : "border-line bg-surface text-ink-muted")}
                >
                  {label}
                </button>
              ))}
            </div>
            {kind === "company" ? (
              <>
                <Input placeholder="Ime podjetja ali lokala" value={f.name} onChange={set("name")} autoComplete="off" autoFocus />
                <Input placeholder="Davčna številka (neobvezno)" value={f.vatId} onChange={set("vatId")} autoComplete="off" />
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Ime" value={f.firstName} onChange={set("firstName")} autoComplete="off" autoFocus />
                <Input placeholder="Priimek" value={f.lastName} onChange={set("lastName")} autoComplete="off" />
              </div>
            )}
            <Input placeholder="Naslov (ulica in številka)" value={f.address} onChange={set("address")} autoComplete="off" />
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <Input placeholder="Pošta" inputMode="numeric" value={f.postCode} onChange={set("postCode")} autoComplete="off" />
              <Input placeholder="Kraj" value={f.city} onChange={set("city")} autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telefon" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="off" />
              <Input placeholder="E-naslov" type="email" inputMode="email" value={f.email} onChange={set("email")} autoComplete="off" />
            </div>
            {kind === "company" && <Input placeholder="Kontaktna oseba (neobvezno)" value={f.contactName} onChange={set("contactName")} autoComplete="off" />}
            <Textarea placeholder="Opomba za dostavo (neobvezno)" value={f.notes} onChange={set("notes")} />
            <p className="text-[11.5px] text-ink-subtle">Če stranka že obstaja (ista davčna številka ali isto ime v istem kraju), te program opozori.</p>
            <Button type="button" size="lg" loading={busy} onClick={save}>Shrani stranko</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
