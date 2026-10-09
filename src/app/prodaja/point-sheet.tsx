"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ExternalLink, Globe, Mail, MapPin, Navigation, Pencil, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { CustomerPointDetail, SalesMapPoint, VenueDetail } from "@/lib/types";
import {
  confirmLocation,
  confirmMatch,
  getCustomerPointDetail,
  getVenueDetail,
  linkVenueToCustomer,
  listCustomersForLink,
  markProspect,
  rejectMatch,
  setVenueIgnored,
  unmarkProspect,
  updateVenueContact,
  type ActionResult,
} from "./actions";
import { KIND_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from "./constants";
import { PlanButton } from "./plan-button";

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[13.5px]">
      <Icon className="size-4 text-ink-subtle mt-0.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

const linkCls = "text-wine hover:underline";

/** Detail + actions for a tapped map point. Opens as a bottom sheet on a phone. */
export function PointSheet({ point, onClose }: { point: SalesMapPoint | null; onClose: () => void }) {
  return (
    <Dialog open={point !== null} onOpenChange={(open) => !open && onClose()}>
      {point && (
        <DialogContent title={point.name}>
          <PlanButton target={point.source === "venue" ? { venueId: point.id } : { customerId: point.id }} />
          {point.source === "venue" ? <VenueBody id={point.id} /> : <CustomerBody id={point.id} />}
        </DialogContent>
      )}
    </Dialog>
  );
}

function CustomerBody({ id }: { id: string }) {
  const [d, setD] = React.useState<CustomerPointDetail | null | undefined>(undefined);
  React.useEffect(() => {
    void getCustomerPointDetail(id).then(setD);
  }, [id]);

  if (d === undefined) return <p className="text-[13px] text-ink-subtle">Nalaganje…</p>;
  if (d === null) return <p className="text-[13px] text-ink-subtle">Stranka ni najdena.</p>;
  return (
    <div className="space-y-3">
      <Badge tone="good">Naša stranka</Badge>
      <p className="text-[12.5px] text-ink-muted">
        Ta stranka ni v seznamu lokalov (restavracije, bari …), zato je prikazana samo kot pika.
      </p>
      <Row icon={MapPin}>{[d.address, d.city].filter(Boolean).join(", ") || "—"}</Row>
      {d.phone && (
        <Row icon={Phone}>
          <a className={linkCls} href={`tel:${d.phone}`}>{d.phone}</a>
        </Row>
      )}
      {d.email && (
        <Row icon={Mail}>
          <a className={linkCls} href={`mailto:${d.email}`}>{d.email}</a>
        </Row>
      )}
    </div>
  );
}

function VenueBody({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = React.useState<VenueDetail | null | undefined>(undefined);
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [customers, setCustomers] = React.useState<{ value: string; label: string; hint?: string }[] | null>(null);
  const [pick, setPick] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ phone: "", email: "", contactName: "", note: "" });

  const load = React.useCallback(async () => {
    const detail = await getVenueDetail(id);
    setD(detail);
    if (detail) {
      setForm({
        phone: detail.phone ?? "",
        email: detail.email ?? "",
        contactName: detail.contactName ?? "",
        note: detail.note ?? "",
      });
    }
  }, [id]);

  React.useEffect(() => {
    setD(undefined);
    setEditing(false);
    setLinking(false);
    void load();
  }, [load]);

  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      await load();
      router.refresh();
    });
  }

  async function openLinking() {
    setLinking(true);
    if (!customers) {
      const list = await listCustomersForLink();
      setCustomers(list.map((c) => ({ value: c.id, label: c.name, hint: c.city ?? undefined })));
    }
  }

  if (d === undefined) return <p className="text-[13px] text-ink-subtle">Nalaganje…</p>;
  if (d === null) return <p className="text-[13px] text-ink-subtle">Lokal ni najden.</p>;

  const status = d.customer ? "client" : d.prospectId ? "prospect" : "open";
  const address = [d.address, [d.postCode, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{KIND_LABEL[d.kind]}</Badge>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {d.source !== "osm" && <Badge tone="info">{SOURCE_LABEL[d.source]}</Badge>}
        {d.ignored && <Badge tone="warn">Skrito (ni cilj)</Badge>}
      </div>

      {d.locationStatus === "unverified" && (
        <Callout tone="warn">
          <p className="font-semibold">Lokacija ni potrjena</p>
          <p className="mt-0.5">
            Podjetje je v poslovnem registru brez kraja; položaj je ugotovljen iz naslova in je lahko napačen
            (isti naslov obstaja tudi drugje). Ali je lokal res tukaj?
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" onClick={() => run(() => confirmLocation(d.id), "Lokacija potrjena")} loading={pending}>
              Da, lokacija je prava
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => setVenueIgnored(d.id, true), "Skrito")} disabled={pending}>
              Ne, skrij
            </Button>
          </div>
        </Callout>
      )}

      {/* ------------------------------------------------ customer match */}
      {d.customer && d.matchStatus === "auto" && (
        <Callout tone="warn">
          <p className="font-semibold">Samodejno ujemanje — preveri</p>
          <p className="mt-0.5">
            {d.customer.name}
            {d.customer.address && ` · ${d.customer.address}`}
            {d.matchDistanceM != null && ` · ${d.matchDistanceM} m`}
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" onClick={() => run(() => confirmMatch(d.id), "Ujemanje potrjeno")} loading={pending}>
              Da, ista stranka
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => rejectMatch(d.id), "Ujemanje zavrnjeno")} disabled={pending}>
              Ni ista
            </Button>
          </div>
        </Callout>
      )}

      {d.customer && d.matchStatus === "confirmed" && (
        <Callout tone="good">
          <p className="font-semibold">Naša stranka</p>
          <p className="mt-0.5">
            {d.customer.name}
            {d.customer.address && ` · ${d.customer.address}`}
          </p>
          <button
            type="button"
            className="mt-1.5 text-[12px] font-medium underline underline-offset-2"
            onClick={() => run(() => rejectMatch(d.id), "Povezava odstranjena")}
            disabled={pending}
          >
            To ni ista stranka — odveži
          </button>
        </Callout>
      )}

      {!d.customer && d.suggested && (
        <Callout tone="info">
          <p className="font-semibold">Je to naša stranka?</p>
          <p className="mt-0.5">
            {d.suggested.name}
            {d.suggested.address && ` · ${d.suggested.address}`}
            {d.suggested.distanceM != null && ` · ${d.suggested.distanceM} m stran`}
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" onClick={() => run(() => confirmMatch(d.id), "Povezano s stranko")} loading={pending}>
              Da, to je stranka
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => rejectMatch(d.id), "Predlog zavrnjen")} disabled={pending}>
              Ne
            </Button>
          </div>
        </Callout>
      )}

      {!d.customer && !d.suggested && !linking && (
        <button
          type="button"
          onClick={() => void openLinking()}
          className="text-[12.5px] font-medium text-ink-subtle hover:text-ink underline underline-offset-2"
        >
          To je naša stranka — poveži …
        </button>
      )}

      {linking && !d.customer && (
        <div className="space-y-2">
          <FieldLabel>Poveži s stranko</FieldLabel>
          <Combobox
            options={customers ?? []}
            value={pick}
            onChange={setPick}
            placeholder={customers ? "Izberi stranko…" : "Nalaganje…"}
            searchPlaceholder="Išči stranko…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!pick}
              loading={pending}
              onClick={() => pick && run(() => linkVenueToCustomer(d.id, pick), "Povezano s stranko")}
            >
              Poveži
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)} disabled={pending}>
              Prekliči
            </Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- details */}
      <div className="space-y-2.5">
        <Row icon={MapPin}>{address || "Naslov ni znan"}</Row>
        {d.phone && (
          <Row icon={Phone}>
            <a className={linkCls} href={`tel:${d.phone.replace(/\s/g, "")}`}>{d.phone}</a>
          </Row>
        )}
        {d.email && (
          <Row icon={Mail}>
            <a className={linkCls} href={`mailto:${d.email}`}>{d.email}</a>
          </Row>
        )}
        {d.website && (
          <Row icon={Globe}>
            <a className={linkCls} href={/^https?:\/\//.test(d.website) ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer">
              {d.website.replace(/^https?:\/\//, "").slice(0, 48)}
            </a>
          </Row>
        )}
        {(d.legalName || d.vatId) && (
          <Row icon={Building2}>
            <span className="text-[12.5px] text-ink-muted">
              {d.legalName}
              {d.vatId && ` · davčna št. ${d.vatId}`}
              {d.representative && ` · zastopnik: ${d.representative}`}
              {d.revenueEur != null && ` · prihodki ${(d.revenueEur / 1_000_000).toLocaleString("sl-SI", { maximumFractionDigits: 1 })} M€`}
              {d.employees != null && ` · ${d.employees} zaposlenih`}
            </span>
          </Row>
        )}
        {d.openingHours && <p className="text-[12.5px] text-ink-muted pl-6.5">Odprto: {d.openingHours}</p>}
        {d.cuisine && <p className="text-[12.5px] text-ink-muted pl-6.5">Ponudba: {d.cuisine}</p>}
        {d.contactName && <p className="text-[12.5px] text-ink-muted pl-6.5">Kontakt: {d.contactName}</p>}
        {d.note && <p className="text-[12.5px] text-ink-muted pl-6.5 whitespace-pre-wrap">{d.note}</p>}
        {!d.phone && !d.email && (
          <p className="text-[12px] text-warn pl-6.5">Ni telefona ali e-naslova — dodaj ga ob obisku.</p>
        )}
      </div>

      {/* -------------------------------------------------- contact edit */}
      {editing ? (
        <div className="space-y-2.5 pt-1">
          <div>
            <FieldLabel>Telefon</FieldLabel>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </div>
          <div>
            <FieldLabel>E-naslov</FieldLabel>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </div>
          <div>
            <FieldLabel>Kontaktna oseba</FieldLabel>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Opomba</FieldLabel>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateVenueContact({ venueId: d.id, ...form });
                  if (!result.ok) return void toast.error(result.error);
                  toast.success("Shranjeno");
                  setEditing(false);
                  await load();
                  router.refresh();
                })
              }
            >
              Shrani
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Prekliči
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Uredi kontakt
        </Button>
      )}

      {/* ------------------------------------------------------ actions */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
        {!d.customer &&
          (d.prospectId ? (
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => run(() => unmarkProspect(d.id), "Odstranjeno iz potencialnih")} disabled={pending}>
              Odstrani iz potencialnih
            </Button>
          ) : (
            <Button size="sm" className="mt-3" onClick={() => run(() => markProspect(d.id), "Označeno kot potencialna stranka")} loading={pending}>
              Označi kot potencialno stranko
            </Button>
          ))}
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          onClick={() => run(() => setVenueIgnored(d.id, !d.ignored), d.ignored ? "Spet prikazano" : "Skrito")}
          disabled={pending}
        >
          {d.ignored ? "Spet prikaži" : "Ni cilj (skrij)"}
        </Button>
      </div>

      <div className="flex gap-4 text-[12px] text-ink-subtle">
        <a className="inline-flex items-center gap-1 hover:text-ink" href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`} target="_blank" rel="noreferrer">
          <Navigation className="size-3" /> Navigacija
        </a>
        {d.osmUrl && (
          <a className="inline-flex items-center gap-1 hover:text-ink" href={d.osmUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3" /> OpenStreetMap
          </a>
        )}
      </div>
    </div>
  );
}
