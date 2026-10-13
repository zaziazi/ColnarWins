"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDay, unconfirmDay } from "@/app/dostava/actions";

/**
 * Confirms a delivery day: from then on its orders appear in Tisk (to be
 * printed) and Dostava (to be ticked off on the day). Undo is allowed until
 * something was mailed to print.
 */
export function DayConfirm({
  date,
  word,
  confirmed,
  printed,
}: {
  date: string;
  word: string | null;
  confirmed: boolean;
  printed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(action: (d: string) => ReturnType<typeof confirmDay>) {
    startTransition(async () => {
      const res = await action(date);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!confirmed) {
    return (
      <Button size="sm" className="h-8 px-2.5 text-[12px]" loading={pending} onClick={() => run(confirmDay)}>
        <CalendarCheck className="size-3.5" /> Potrdi dostavo{word ? ` za ${word}` : ""}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-good">
        <Check className="size-3.5" strokeWidth={3} /> Potrjeno
      </span>
      {!printed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(unconfirmDay)}
          className="text-[11.5px] text-ink-subtle underline underline-offset-2 disabled:opacity-50"
        >
          Prekliči
        </button>
      )}
    </div>
  );
}
