"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { lookupVat, updateCustomer } from "./actions";

export interface EditableCustomer {
  id: string;
  name: string;
  vatId: string | null;
  address: string | null;
  postCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  businessUnit: string | null;
  deliveryNotes: string | null;
}

const toForm = (c: EditableCustomer) => ({
  name: c.name,
  vatId: c.vatId ?? "",
  address: c.address ?? "",
  postCode: c.postCode ?? "",
  city: c.city ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  contactName: c.contactName ?? "",
  businessUnit: c.businessUnit ?? "",
  notes: c.deliveryNotes ?? "",
});

/** "Uredi": change a customer's details (name, VAT id, address, contact, poslovna enota, note for the driver). */
export function EditCustomerButton({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState(() => toForm(customer));
  const [busy, startSave] = React.useTransition();
  const [looking, startLookup] = React.useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function lookup() {
    startLookup(async () => {
      const r = await lookupVat(f.vatId);
      if (!r.ok) return void toast.error(r.error);
      const c = r.company;
      setF((cur) => ({ ...cur, vatId: c.vatId, name: c.name || cur.name, address: c.address || cur.address, postCode: c.postCode || cur.postCode, city: c.city || cur.city }));
      toast.success(c.name ? `Najdeno: ${c.name}. Preveri in shrani.` : "Davčna številka je veljavna.");
    });
  }

  function save() {
    startSave(async () => {
      const r = await updateCustomer({ customerId: customer.id, ...f });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Podatki so shranjeni.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setF(toForm(customer));
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-wine"
      >
        <Pencil className="size-3.5" /> Uredi
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={customer.name}>
          <div className="space-y-2.5">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input placeholder="Davčna številka" value={f.vatId} onChange={set("vatId")} autoComplete="off" />
              <Button type="button" variant="secondary" loading={looking} disabled={f.vatId.trim().length < 6} onClick={lookup}>
                Poišči
              </Button>
            </div>
            <Input placeholder="Ime" value={f.name} onChange={set("name")} autoComplete="off" />
            <Input placeholder="Poslovna enota (neobvezno)" value={f.businessUnit} onChange={set("businessUnit")} autoComplete="off" />
            <Input placeholder="Naslov (ulica in številka)" value={f.address} onChange={set("address")} autoComplete="off" />
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <Input placeholder="Pošta" inputMode="numeric" value={f.postCode} onChange={set("postCode")} autoComplete="off" />
              <Input placeholder="Kraj" value={f.city} onChange={set("city")} autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telefon" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="off" />
              <Input placeholder="E-naslov" type="email" inputMode="email" value={f.email} onChange={set("email")} autoComplete="off" />
            </div>
            <Input placeholder="Kontaktna oseba (neobvezno)" value={f.contactName} onChange={set("contactName")} autoComplete="off" />
            <Textarea placeholder="Opomba za dostavo (neobvezno)" value={f.notes} onChange={set("notes")} />
            <Button type="button" size="lg" loading={busy} onClick={save}>Shrani</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
