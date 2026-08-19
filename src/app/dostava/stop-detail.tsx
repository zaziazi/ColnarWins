"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, FieldLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { eur } from "@/lib/format";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import type { DriverStop } from "@/lib/types";

interface Props {
  stop: DriverStop;
  pending: boolean;
  onBack: () => void;
  onConfirm: (args: {
    lines: { productId: string; quantityDelivered: number }[];
    signerName: string;
    note: string;
    signatureBlob: Blob;
  }) => void;
  onFail: (reason: string) => void;
}

export function StopDetail({ stop, pending, onBack, onConfirm, onFail }: Props) {
  const [quantities, setQuantities] = React.useState<Record<string, number>>(() => {
    const q: Record<string, number> = {};
    for (const l of stop.lines) q[l.productId] = l.quantityOrdered;
    return q;
  });
  const [signerName, setSignerName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [failing, setFailing] = React.useState(false);
  const [failReason, setFailReason] = React.useState("");
  const padRef = React.useRef<SignaturePadHandle>(null);

  const total = stop.lines.reduce(
    (sum, l) => sum + (quantities[l.productId] ?? 0) * l.unitPriceNet * (1 + l.vatRate),
    0,
  );

  async function confirm() {
    if (!signerName.trim()) return;
    if (padRef.current?.isEmpty()) {
      toast.error("Manjka podpis stranke");
      return;
    }
    const blob = await padRef.current?.toBlob();
    if (!blob) return;
    onConfirm({
      lines: stop.lines.map((l) => ({ productId: l.productId, quantityDelivered: quantities[l.productId] ?? 0 })),
      signerName: signerName.trim(),
      note,
      signatureBlob: blob,
    });
  }

  const canConfirm = signerName.trim().length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-subtle hover:text-ink mb-4"
      >
        <ChevronLeft className="size-4" /> Postanki
      </button>

      <div className="mb-4">
        <h2 className="font-bold text-[17px]">{stop.customerName}</h2>
        <p className="text-[13px] text-ink-muted mt-0.5">
          {[stop.address, stop.city].filter(Boolean).join(", ") || "—"}
          {stop.deliveryNotes && ` · ${stop.deliveryNotes}`}
        </p>
      </div>

      {pending && (
        <Callout tone="warn" className="mb-4">
          Ta dostava čaka na sinhronizacijo — shranjena je na telefonu.
        </Callout>
      )}

      {failing ? (
        <Card className="p-3.5">
          <p className="text-[13.5px] font-semibold mb-2">Stranke ni bilo mogoče dostaviti</p>
          <FieldLabel>Razlog</FieldLabel>
          <Textarea
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            placeholder="npr. stranke ni bilo, naslov ne obstaja, zavrnitev prevzema"
            autoFocus
          />
          <div className="flex gap-2 mt-3">
            <Button
              variant="danger"
              size="sm"
              onClick={() => failReason.trim() && onFail(failReason.trim())}
              disabled={!failReason.trim() || pending}
            >
              Potrdi neuspelo dostavo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFailing(false)}>
              Nazaj
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="px-3.5 mb-4">
            {stop.lines.map((l, i) => (
              <div
                key={l.productId}
                className={
                  "flex items-center gap-3 py-2.5" + (i < stop.lines.length - 1 ? " border-b border-line" : "")
                }
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{l.productName}</p>
                  <p className="text-[11.5px] text-ink-subtle">
                    naročeno {l.quantityOrdered} · {eur(l.unitPriceNet)}
                  </p>
                </div>
                <Stepper
                  value={quantities[l.productId] ?? 0}
                  min={0}
                  max={l.quantityOrdered}
                  step={1}
                  label={l.productName}
                  onChange={(v) => setQuantities((q) => ({ ...q, [l.productId]: v }))}
                />
              </div>
            ))}
            <div className="flex justify-between items-baseline pt-3 pb-2.5 border-t-2 border-line mt-1">
              <span className="text-[13.5px] font-bold">Skupaj (dostavljeno)</span>
              <span className="text-[13.5px] font-bold tabular">{eur(total)}</span>
            </div>
          </Card>

          <Card className="p-3.5 mb-4">
            <FieldLabel>Prevzel/a (ime)</FieldLabel>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Ime in priimek" />

            <FieldLabel className="mt-3.5">Opomba</FieldLabel>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="karkoli — manjkajoč zaboj, plačilo, dostop…"
            />

            <FieldLabel className="mt-3.5">Podpis stranke</FieldLabel>
            <SignaturePad ref={padRef} />
          </Card>

          <Button size="lg" onClick={confirm} loading={pending} disabled={!canConfirm}>
            Potrdi dostavo
          </Button>

          <button
            type="button"
            onClick={() => setFailing(true)}
            className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-danger py-2"
          >
            <TriangleAlert className="size-3.5" /> Stranke ni bilo
          </button>
        </>
      )}
    </div>
  );
}
