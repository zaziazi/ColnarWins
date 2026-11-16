"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restoreOrder } from "@/app/pisarna/actions";

/** Takes one of the salesperson's own cancelled orders back. */
export function RestoreButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <div className="mt-2.5 pt-2.5 border-t border-line">
      <Button
        size="sm"
        variant="secondary"
        className="h-7 px-2 text-[11.5px] gap-1"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await restoreOrder(orderId);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Naročilo je spet aktivno.");
            router.refresh();
          })
        }
      >
        <Undo2 className="size-3" /> Obnovi naročilo
      </Button>
    </div>
  );
}
