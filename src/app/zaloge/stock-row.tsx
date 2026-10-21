"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { adjustStock, writeOffStock } from "./actions";
import { steklenice } from "@/lib/format";
import type { StockLevel } from "@/lib/types";

export function StockRow({ level }: { level: StockLevel }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [delta, setDelta] = React.useState("");
  const [note, setNote] = React.useState("");
  const [mode, setMode] = React.useState<"adjust" | "writeoff">("adjust");
  const [reason, setReason] = React.useState<"Razbitje" | "Degustacija" | "Poškodovano" | "Drugo">("Razbitje");
  const [pending, startTransition] = React.useTransition();

  function submit() {
    if (mode === "writeoff") {
      const q = parseInt(delta.replace(/\D/g, ""), 10);
      if (!q) return;
      startTransition(async () => {
        const result = await writeOffStock({ productId: level.productId, qty: q, reason, note });
        if (!result.ok) return void toast.error(result.error ?? "Odpis ni uspel");
        setDelta("");
        setNote("");
        setOpen(false);
        router.refresh();
      });
      return;
    }
    const n = parseInt(delta, 10);
    if (!n) return;

    startTransition(async () => {
      const result = await adjustStock({ productId: level.productId, delta: n, note });
      if (!result.ok) {
        toast.error(result.error ?? "Popravek ni uspel");
        return;
      }
      setDelta("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="border-b border-line last:border-b-0 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold truncate">{level.productName}</p>
          <p className="text-[11.5px] text-ink-subtle mt-0.5">
            {steklenice(level.quantityOnHand)} · zaboj {level.caseSize}
          </p>
        </div>
        <button
          type="button"
          aria-label="Popravi zalogo"
          onClick={() => setOpen((o) => !o)}
          className="h-8 w-8 shrink-0 grid place-items-center rounded-[8px] text-ink-subtle
                     hover:bg-surface-muted hover:text-ink transition-colors"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="inline-flex rounded-[var(--radius-control)] border border-line overflow-hidden text-[12.5px] font-semibold">
            {(
              [
                ["adjust", "Popravek"],
                ["writeoff", "Odpis"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setMode(k);
                  setDelta("");
                }}
                className={"h-8 px-3 " + (mode === k ? "bg-wine text-white" : "bg-surface text-ink-muted")}
              >
                {t}
              </button>
            ))}
          </div>
          {mode === "writeoff" && (
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[14px]"
              aria-label="Razlog odpisa"
            >
              {["Razbitje", "Degustacija", "Poškodovano", "Drugo"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
          <Input
            type="text"
            inputMode="numeric"
            placeholder={mode === "writeoff" ? "koliko steklenic odpisati" : "npr. -6 ali 12"}
            value={delta}
            onChange={(e) => setDelta(mode === "writeoff" ? e.target.value.replace(/\D/g, "") : e.target.value.replace(/(?!^-)[^\d]/g, ""))}
            autoFocus
          />
          <Textarea
            placeholder="Razlog (npr. lom, popis)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[52px]"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} loading={pending} disabled={!delta}>
              Shrani
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Prekliči
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
