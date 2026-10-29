"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteFix, setFixStatus } from "@/app/fix/actions";

export function FixRowActions({ id, status }: { id: string; status: "new" | "done" }) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={busy} onClick={() => run(() => setFixStatus(id, status === "new" ? "done" : "new"))} className="text-[12.5px] font-semibold text-wine disabled:opacity-50">
        {status === "new" ? "Označi kot rešeno" : "Odpri znova"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Izbrišem ta predlog? Tega ni mogoče razveljaviti.")) run(() => deleteFix(id));
        }}
        className="text-[12.5px] font-semibold text-ink-subtle hover:text-danger disabled:opacity-50"
      >
        Izbriši
      </button>
    </div>
  );
}
