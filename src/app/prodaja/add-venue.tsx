"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { VenueKind } from "@/lib/types";
import { createVenue, type CreateVenueResult } from "./actions";
import { ADD_KINDS, KIND_LABEL } from "./constants";

export interface VenueDraft {
  name: string;
  kind: Exclude<VenueKind, "other">;
  address: string;
  city: string;
  postCode: string;
  phone: string;
  email: string;
  contactName: string;
  note: string;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_DRAFT: VenueDraft = {
  name: "",
  kind: "restaurant",
  address: "",
  city: "",
  postCode: "",
  phone: "",
  email: "",
  contactName: "",
  note: "",
  lat: null,
  lng: null,
};

/** "Dodaj lokal": add a restaurant/bar that is missing from the map. */
export function AddVenueDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  canPickOnMap,
  onPickOnMap,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: VenueDraft;
  setDraft: (d: VenueDraft) => void;
  /** Only the map view can drop a pin. */
  canPickOnMap: boolean;
  onPickOnMap: () => void;
  onCreated: (r: Extract<CreateVenueResult, { ok: true }>) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [problem, setProblem] = React.useState<{ text: string; duplicate?: { id: string; name: string }; geocode?: boolean } | null>(null);

  const set = <K extends keyof VenueDraft>(k: K, v: VenueDraft[K]) => setDraft({ ...draft, [k]: v });

  function submit(force = false) {
    setProblem(null);
    startTransition(async () => {
      const result = await createVenue({ ...draft, force });
      if (!result.ok) {
        setProblem({ text: result.error, duplicate: result.duplicate, geocode: result.code === "geocode_failed" });
        return;
      }
      toast.success(`Lokal »${result.name}« dodan`);
      setDraft(EMPTY_DRAFT);
      onOpenChange(false);
      router.refresh();
      onCreated(result);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Dodaj lokal">
        <div className="space-y-3">
          <div>
            <FieldLabel>Ime lokala *</FieldLabel>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="npr. Gostilna Pri Mostu" autoFocus />
          </div>

          <div>
            <FieldLabel>Vrsta</FieldLabel>
            <select
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as VenueDraft["kind"])}
              className="w-full h-11 px-3 rounded-[var(--radius-control)] bg-surface text-ink border border-line"
            >
              {ADD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Naslov (ulica in številka)</FieldLabel>
            <Input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="npr. Glavni trg 12" />
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <div>
              <FieldLabel>Kraj</FieldLabel>
              <Input value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="Novo mesto" />
            </div>
            <div>
              <FieldLabel>Pošta</FieldLabel>
              <Input value={draft.postCode} onChange={(e) => set("postCode", e.target.value)} placeholder="8000" inputMode="numeric" />
            </div>
          </div>

          {canPickOnMap && (
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={onPickOnMap}>
                <Crosshair className="size-3.5" /> {draft.lat != null ? "Lokacija izbrana ✓ — spremeni" : "Postavi na zemljevid"}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Telefon</FieldLabel>
              <Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
            </div>
            <div>
              <FieldLabel>E-naslov</FieldLabel>
              <Input value={draft.email} onChange={(e) => set("email", e.target.value)} inputMode="email" />
            </div>
          </div>
          <div>
            <FieldLabel>Kontaktna oseba</FieldLabel>
            <Input value={draft.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </div>
          <div>
            <FieldLabel>Opomba</FieldLabel>
            <Textarea value={draft.note} onChange={(e) => set("note", e.target.value)} />
          </div>

          {problem && (
            <Callout tone={problem.duplicate ? "warn" : "danger"}>
              <p>{problem.text}</p>
              {problem.duplicate && (
                <div className="mt-2">
                  <Button size="sm" variant="secondary" onClick={() => submit(true)} loading={pending}>
                    Vseeno dodaj
                  </Button>
                </div>
              )}
              {problem.geocode && !canPickOnMap && (
                <p className="mt-1 text-[12px]">Na zavihku »Zemljevid« lahko lokacijo postaviš ročno.</p>
              )}
            </Callout>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={() => submit(false)} loading={pending} disabled={draft.name.trim().length < 2}>
              Dodaj lokal
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Prekliči
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
