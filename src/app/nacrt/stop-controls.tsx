"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { moveStop, removeStop } from "./actions";

export function StopControls({
  stopId,
  isFirst,
  isLast,
}: {
  stopId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveStop({ stopId, direction });
      if (!result.ok) {
        toast.error(result.error ?? "Premik ni uspel");
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeStop(stopId);
      if (!result.ok) {
        toast.error(result.error ?? "Odstranitev ni uspela");
        return;
      }
      toast("Naročilo umaknjeno s poti");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        aria-label="Pomakni gor"
        onClick={() => move("up")}
        disabled={pending || isFirst}
        className="h-7 w-7 grid place-items-center rounded-[8px] text-ink-subtle
                   hover:bg-surface-muted hover:text-ink disabled:opacity-30 transition-colors"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Pomakni dol"
        onClick={() => move("down")}
        disabled={pending || isLast}
        className="h-7 w-7 grid place-items-center rounded-[8px] text-ink-subtle
                   hover:bg-surface-muted hover:text-ink disabled:opacity-30 transition-colors"
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Odstrani s poti"
        onClick={remove}
        disabled={pending}
        className="h-7 w-7 grid place-items-center rounded-[8px] text-ink-subtle
                   hover:bg-danger/10 hover:text-danger disabled:opacity-30 transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
