"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addOrderToMyRoute } from "./actions";

/** Driver's one-tap "this goes on my load" — no route to create or pick first. */
export function AddToMyRoute({ orderId, date }: { orderId: string; date: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function add() {
    startTransition(async () => {
      const result = await addOrderToMyRoute({ orderId, date });
      if (!result.ok) {
        toast.error(result.error ?? "Naročila ni bilo mogoče dodati");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="secondary" onClick={add} loading={pending}>
      <Plus /> Dodaj na mojo pot
    </Button>
  );
}
