"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, MessageCircle, Phone, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/card";
import { dateSl, kitchenMessage, manualLink, presenterMessage } from "@/lib/degustacije/messages";
import type { DegustacijaPerson, GroupBooking } from "@/lib/types";
import { markNotified, notifyBookingNow, setBookingStatus } from "../actions";
import { BookingForm, emptyDraft } from "../booking-form";
import { BOOKING_LABEL } from "../constants";

const dt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const TONE = { tentative: "warn", confirmed: "good", visited: "info", cancelled: "danger" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel className="mb-1">{label}</FieldLabel>
      <div className="text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}

/** Everything about one group: who, how many, wine wishes, food, contact, who is in charge — and the messages. */
export function BookingDialog({
  booking: b,
  persons,
  onClose,
}: {
  booking: GroupBooking;
  persons: DegustacijaPerson[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [manual, setManual] = React.useState(false);

  const presenter = persons.find((p) => p.id === b.presenterId) ?? null;
  const kitchen = persons.find((p) => p.id === b.kitchenId) ?? null;

  async function run(p: Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Ni uspelo.");
    toast.success(ok);
    router.refresh();
  }

  async function notifyNow() {
    setBusy(true);
    const r = await notifyBookingNow(b.id);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const { presenter: p, kitchen: k, errors } = r.result;
    if (p === "unconfigured" || k === "unconfigured") {
      setManual(true);
      toast.message("Samodejno pošiljanje še ni nastavljeno — pošlji s spodnjima povezavama.");
    } else if (errors.length) toast.error(errors[0]);
    else toast.success("Sporočila poslana");
    router.refresh();
  }

  if (editing) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent title="Uredi degustacijo">
          <BookingForm
            draft={emptyDraft({
              id: b.id,
              drustvoId: b.drustvoId,
              webReservationId: b.webReservationId,
              groupName: b.groupName,
              visitDate: b.visitDate,
              startTime: b.startTime ?? "",
              endTime: b.endTime ?? "",
              people: b.peoplePlanned?.toString() ?? "",
              winePreferences: b.winePreferences ?? "",
              food: b.food,
              foodNotes: b.foodNotes ?? "",
              contactName: b.contactName ?? "",
              contactPhone: b.contactPhone ?? "",
              contactEmail: b.contactEmail ?? "",
              presenterId: b.presenterId,
              kitchenId: b.kitchenId,
              status: b.status,
              notes: b.notes ?? "",
              peopleActual: b.status === "visited" ? (b.peopleActual?.toString() ?? "") : undefined,
              wineSalesEur: b.status === "visited" ? (b.wineSalesEur?.toString() ?? "") : undefined,
            })}
            persons={persons}
            submitLabel="Shrani spremembe"
            onSaved={() => {
              router.refresh();
              onClose();
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  const presenterText = presenterMessage(b);
  const kitchenText = kitchenMessage(b);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={b.groupName}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
            {b.source === "web" && <Badge tone="info">Spletna rezervacija</Badge>}
            {b.source === "drustvo" && <Badge>Društvo</Badge>}
          </div>

          <Row label="Kdaj">
            {dateSl(b.visitDate)}
            {b.startTime && ` · ${b.startTime}`}
            {b.endTime && `–${b.endTime}`}
          </Row>
          <Row label="Oseb">{b.peoplePlanned ?? "—"}</Row>
          <Row label="Vina">
            {b.winePreferences ? (
              <>
                <span className="text-ink-subtle text-[12px]">Izberemo na licu mesta. Želje: </span>
                {b.winePreferences}
              </>
            ) : (
              <span className="text-ink-subtle">Izberemo na licu mesta</span>
            )}
          </Row>
          <Row label="Hrana">
            {b.food ? `Da${b.foodNotes ? ` — ${b.foodNotes}` : ""}` : "Ne"}
          </Row>
          {(b.contactName || b.contactPhone || b.contactEmail) && (
            <Row label="Kontakt">
              <div>{b.contactName}</div>
              <div className="flex flex-wrap gap-3 mt-0.5">
                {b.contactPhone && (
                  <a href={`tel:${b.contactPhone}`} className="inline-flex items-center gap-1 text-wine">
                    <Phone className="size-3.5" /> {b.contactPhone}
                  </a>
                )}
                {b.contactEmail && (
                  <a href={`mailto:${b.contactEmail}`} className="inline-flex items-center gap-1 text-wine break-all">
                    <Mail className="size-3.5" /> {b.contactEmail}
                  </a>
                )}
              </div>
            </Row>
          )}
          <Row label="Voditelj">
            {presenter ? (
              <>
                {presenter.name}
                <div className="text-[12px] text-ink-subtle">
                  {b.presenterNotifiedAt ? `Obveščen ${dt.format(new Date(b.presenterNotifiedAt))}` : "Še ni obveščen (dobi sporočilo dan prej)"}
                </div>
              </>
            ) : (
              <span className="text-ink-subtle">Ni izbran</span>
            )}
          </Row>
          {b.food && (
            <Row label="Hrano pripravi">
              {kitchen ? (
                <>
                  {kitchen.name}
                  <div className="text-[12px] text-ink-subtle">
                    {b.kitchenNotifiedAt ? `Obveščena ${dt.format(new Date(b.kitchenNotifiedAt))}` : "Še ni obveščena (dobi sporočilo dan prej)"}
                  </div>
                </>
              ) : (
                <span className="text-ink-subtle">Ni izbrana</span>
              )}
            </Row>
          )}
          {b.notes && <Row label="Opombe"><span className="whitespace-pre-wrap">{b.notes}</span></Row>}
          {b.status === "visited" && (
            <Row label="Po obisku">
              Prišlo: {b.peopleActual ?? "—"} · Prodano vino: {b.wineSalesEur !== null ? `${b.wineSalesEur} €` : "—"}
            </Row>
          )}

          {manual && (
            <div className="rounded-[12px] border border-line p-3 space-y-2">
              <p className="text-[12.5px] text-ink-muted">Samodejno pošiljanje ni nastavljeno. Pošlji sporočili sam; besedilo je že pripravljeno.</p>
              {([["presenter", presenter, presenterText], ["kitchen", kitchen, kitchenText]] as const).map(([who, person, text]) => {
                if (!person || (who === "kitchen" && !b.food)) return null;
                const link = manualLink(person, text);
                return (
                  <div key={who} className="flex items-center justify-between gap-2">
                    <span className="text-[13px]">
                      {who === "presenter" ? "Voditelj" : "Hrana"}: {person.name}
                    </span>
                    {link ? (
                      <Button asChild size="sm" variant="secondary">
                        <a href={link} target="_blank" rel="noreferrer" onClick={() => void markNotified(b.id, who).then(() => router.refresh())}>
                          <MessageCircle className="size-4" /> {person.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-[12px] text-ink-subtle">Brez telefona</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Uredi
            </Button>
            {b.status !== "cancelled" && (presenter || (b.food && kitchen)) && (
              <Button size="sm" variant="secondary" onClick={() => void notifyNow()} loading={busy}>
                <MessageCircle className="size-4" /> Obvesti zdaj
              </Button>
            )}
            {b.status === "tentative" && (
              <Button size="sm" onClick={() => void run(setBookingStatus(b.id, "confirmed"), "Potrjeno")} disabled={busy}>
                Potrdi
              </Button>
            )}
            {b.status !== "cancelled" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Preklicati to degustacijo?")) void run(setBookingStatus(b.id, "cancelled"), "Preklicano").then(onClose);
                }}
              >
                Prekliči
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
