"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { deleteDeliveredOrder } from "./actions";

/** Two-step permanent delete of a delivered order — for cleaning up test deliveries. */
export function DeleteDelivered({ orderId, hasReceipt }: { orderId: string; hasReceipt: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteDeliveredOrder(orderId);
      if (!result.ok) {
        toast.error(result.error);
        setConfirming(false);
        return;
      }
      toast.success("Naročilo izbrisano");
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-ink-subtle hover:text-danger transition-colors"
      >
        <Trash2 className="size-3" /> Izbriši
      </button>
    );
  }

  return (
    <Callout tone="danger" className="mt-2.5">
      <p>
        Trajno izbrišem to naročilo
        {hasReceipt ? ", račun, dobavnico in podpis" : " in podpis"}? Tega ni mogoče razveljaviti. Račun s
        vpisanim plačilom ni mogoče izbrisati.
      </p>
      <div className="flex gap-2 mt-2.5">
        <Button size="sm" variant="danger" onClick={remove} loading={pending}>
          Da, izbriši
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Nazaj
        </Button>
      </div>
    </Callout>
  );
}
