"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { cancelOrder, confirmOrder, deleteOrder, restoreOrder } from "./actions";
import type { OrderStatus } from "@/lib/types";

const CANCELLABLE: OrderStatus[] = ["draft", "confirmed", "planned"];

/** Confirm / cancel controls on an order card. Cancel is two-step — same warn-before-committing pattern as the Klet stage change. */
export function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await confirmOrder(orderId);
      if (!result.ok) {
        toast.error(result.error ?? "Potrditev ni uspela");
        return;
      }
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelOrder(orderId, reason);
      if (!result.ok) {
        toast.error(result.error ?? "Preklic ni uspel");
        setConfirmingCancel(false);
        return;
      }
      setConfirmingCancel(false);
      setReason("");
      router.refresh();
      // a mistaken cancel is one tap to undo
      toast("Naročilo je preklicano.", {
        duration: 12000,
        action: {
          label: "Razveljavi",
          onClick: async () => {
            const r = await restoreOrder(orderId);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Naročilo je spet aktivno.");
            router.refresh();
          },
        },
      });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteOrder(orderId);
      setConfirmingDelete(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Naročilo je izbrisano.");
      router.refresh();
    });
  }

  if (!CANCELLABLE.includes(status)) return null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1.5">
        {status === "draft" && (
          <Button size="sm" className="h-7 px-2 text-[11.5px] gap-1" onClick={confirm} loading={pending}>
            <Check className="size-3" /> Potrdi
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11.5px] gap-1 text-danger hover:bg-danger-soft"
          onClick={() => setConfirmingCancel(true)}
          disabled={pending}
        >
          <X className="size-3" /> Prekliči
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11.5px] gap-1 text-ink-subtle hover:text-danger hover:bg-danger-soft"
          onClick={() => setConfirmingDelete(true)}
          disabled={pending}
        >
          <Trash2 className="size-3" /> Izbriši
        </Button>
      </div>

      {confirmingCancel && (
        <Callout tone="danger" className="mt-2">
          <p>Prekliči to naročilo? Preklicano naročilo lahko kasneje obnoviš v razdelku »Preklicana«.</p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Razlog (neobvezno)"
            className="mt-2 h-9 bg-surface"
          />
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant="danger" onClick={cancel} loading={pending}>
              Prekliči naročilo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingCancel(false)} disabled={pending}>
              Nazaj
            </Button>
          </div>
        </Callout>
      )}

      {confirmingDelete && (
        <Callout tone="danger" className="mt-2">
          <p>Trajno izbrišem to naročilo? Tega ni mogoče razveljaviti. Če nisi prepričan, ga raje prekliči: preklicano naročilo lahko obnoviš.</p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant="danger" onClick={remove} loading={pending}>
              Izbriši naročilo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Nazaj
            </Button>
          </div>
        </Callout>
      )}
    </div>
  );
}
