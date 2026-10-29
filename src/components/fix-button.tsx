"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { submitFix } from "@/app/fix/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const KINDS = [
  { key: "problem", label: "Nekaj ne dela", hint: "Napaka, nejasnost, počasno…" },
  { key: "idea", label: "Želim / predlagam", hint: "Boljša rešitev ali nova stvar" },
] as const;

/** "FIX 🔧": anyone signed in can tell us what is wrong or what they would like. Saved with the screen they were on. */
export function FixButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"problem" | "idea">("problem");
  const [message, setMessage] = React.useState("");
  const [busy, startTransition] = React.useTransition();

  function send() {
    startTransition(async () => {
      const r = await submitFix({
        kind,
        message,
        pagePath: pathname,
        pageTitle: document.title === "Colnix" ? (document.querySelector("h1")?.textContent ?? "") : document.title,
        device: `${window.innerWidth}×${window.innerHeight} ${window.matchMedia("(pointer: coarse)").matches ? "telefon" : "računalnik"}`,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Hvala! Shranjeno, vodstvo bo videlo.");
      setMessage("");
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Prijavi napako ali predlagaj izboljšavo"
        className={cn(
          "h-8 px-2.5 rounded-full border border-wine-border bg-wine-soft text-wine text-[12px] font-bold tracking-[0.02em]",
          "inline-flex items-center gap-1 hover:bg-wine hover:text-white transition-colors",
          className,
        )}
      >
        FIX <span aria-hidden="true">🔧</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="FIX 🔧 Kaj bi popravili?">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                    kind === k.key ? "border-wine bg-wine-soft" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className={cn("block text-[13px] font-semibold", kind === k.key && "text-wine")}>{k.label}</span>
                  <span className="block text-[11px] text-ink-subtle">{k.hint}</span>
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              autoFocus
              placeholder={kind === "problem" ? "Kaj se je zgodilo? Kaj si pričakoval?" : "Kaj bi si želel in zakaj bi ti pomagalo?"}
              className="w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 text-[15px] focus:border-wine focus:ring-4 focus:ring-wine-soft focus:outline-none"
            />
            <p className="text-[11.5px] text-ink-subtle">Zraven se shrani stran, na kateri si: <span className="font-semibold">{pathname}</span></p>
            <Button type="button" size="lg" disabled={busy || message.trim().length < 3} onClick={send}>
              {busy ? "Pošiljam…" : "Pošlji"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
