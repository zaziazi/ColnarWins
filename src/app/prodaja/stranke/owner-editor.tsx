"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { setCustomerRep } from "./actions";

export interface Candidate {
  id: string;
  name: string;
  city: string | null;
  repId: string | null;
  repName: string | null;
}

/** Manager: add a customer to this salesperson's list. */
export function AddCustomer({ repId, repName, candidates }: { repId: string; repName: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [pick, setPick] = React.useState<string | null>(null);
  const [busy, startTransition] = React.useTransition();
  const chosen = candidates.find((c) => c.id === pick);

  function add() {
    if (!pick) return;
    startTransition(async () => {
      const r = await setCustomerRep(pick, repId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${chosen?.name} je zdaj stranka: ${repName}`);
      setPick(null);
      router.refresh();
    });
  }

  return (
    <Card className="p-3.5 mb-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2">Dodeli stranko: {repName}</p>
      <div className="flex flex-col min-[900px]:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <Combobox
            options={candidates.map((c) => ({ value: c.id, label: c.name, hint: [c.city, c.repName ? `zdaj: ${c.repName}` : "brez prodajalca"].filter(Boolean).join(" · ") }))}
            value={pick}
            onChange={setPick}
            placeholder="Izberi stranko…"
            searchPlaceholder="Išči stranko…"
          />
        </div>
        <Button type="button" disabled={!pick || busy} onClick={add}>Dodaj</Button>
      </div>
      {chosen?.repName && chosen.repId !== repId && (
        <p className="text-[12px] text-warn mt-2">Ta stranka je zdaj pri: {chosen.repName}. Z dodajanjem jo prevzame {repName}.</p>
      )}
    </Card>
  );
}

export function RemoveCustomer({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!window.confirm(`Odstranim ${name} s seznama strank tega prodajalca?`)) return;
        startTransition(async () => {
          const r = await setCustomerRep(customerId, null);
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        });
      }}
      className="text-[12px] font-semibold text-ink-subtle hover:text-danger"
    >
      Odstrani
    </button>
  );
}
