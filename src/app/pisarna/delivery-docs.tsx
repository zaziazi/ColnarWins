"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderListItem } from "@/lib/types";
import { sendDeliveryDocuments } from "./actions";

type Mail = NonNullable<OrderListItem["mail"]>;

const STATUS: Record<Mail["status"], { label: string; tone: "good" | "warn" | "danger" | "neutral" }> = {
  sent: { label: "Poslano", tone: "good" },
  queued: { label: "Ni še poslano", tone: "warn" },
  failed: { label: "Pošiljanje ni uspelo", tone: "danger" },
  no_recipient: { label: "Ni e-naslova", tone: "warn" },
};

/** Dobavnica + račun on a delivered order card: open the PDFs, see mail status, send or re-send. */
export function DeliveryDocs({ orderId, mail }: { orderId: string; mail: Mail }) {
  const router = useRouter();
  const [recipient, setRecipient] = React.useState(mail.recipient ?? "");
  const [resending, setResending] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const s = STATUS[mail.status];

  function send() {
    startTransition(async () => {
      const result = await sendDeliveryDocuments(orderId, recipient);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success("Dokumenta poslana");
      setResending(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          {mail.status === "sent" && mail.recipient && (
            <span className="text-[11.5px] text-ink-subtle truncate">{mail.recipient}</span>
          )}
        </div>
        <div className="flex gap-3 text-[12px] font-medium">
          <a
            href={`/api/delivery-docs/${orderId}/dobavnica`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-wine hover:underline"
          >
            <FileText className="size-3.5" /> Dobavnica
          </a>
          <a
            href={`/api/delivery-docs/${orderId}/racun`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-wine hover:underline"
          >
            <FileText className="size-3.5" /> Račun
          </a>
        </div>
      </div>

      {mail.error && mail.status !== "sent" && (
        <p className="text-[11.5px] text-ink-muted mt-1.5">{mail.error}</p>
      )}

      {mail.status === "sent" && !resending && (
        <button
          type="button"
          onClick={() => setResending(true)}
          className="mt-1.5 text-[12px] font-medium text-ink-subtle hover:text-ink"
        >
          Pošlji znova…
        </button>
      )}

      {(mail.status !== "sent" || resending) && (
        <div className="flex gap-2 mt-2">
          <Input
            type="email"
            inputMode="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="E-naslov prejemnika"
            className="h-9"
          />
          <Button size="sm" onClick={send} loading={pending} disabled={!recipient.trim()}>
            <Send className="size-3.5" /> Pošlji
          </Button>
        </div>
      )}
    </div>
  );
}
