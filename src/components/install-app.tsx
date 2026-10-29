"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "colnix_install_dismissed";
const EVENT = "colnix:installable";
let deferred: InstallEvent | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Mounted once in the root layout: registers the root service worker (needed for Android to offer
 * the install) and keeps the browser's install prompt so a button anywhere can fire it later.
 */
export function PwaBoot() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/colnix-sw.js", { scope: "/" }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallEvent;
      window.dispatchEvent(new Event(EVENT));
    };
    const onInstalled = () => {
      deferred = null;
      window.dispatchEvent(new Event(EVENT));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

type Mode = "hidden" | "prompt" | "android" | "ios";

/** "Dodaj Colnix na začetni zaslon": shown on phones that opened the site in a browser, never inside the installed app. */
export function InstallCard() {
  const [mode, setMode] = React.useState<Mode>("hidden");
  const [help, setHelp] = React.useState(false);

  React.useEffect(() => {
    const decide = () => {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      } catch {}
      const phone = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
      if (dismissed || !phone || isStandalone()) return setMode("hidden");
      if (deferred) return setMode("prompt");
      setMode(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "android");
    };
    decide();
    window.addEventListener(EVENT, decide);
    return () => window.removeEventListener(EVENT, decide);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return setHelp(true);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") setMode("hidden");
    else setMode("android");
  }

  if (mode === "hidden") return null;

  return (
    <Card className="p-3.5 mb-4 border-wine-border bg-wine-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-wine text-white">
          <Download className="size-[18px]" strokeWidth={1.9} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold">Colnix kot aplikacija na telefonu</p>
          <p className="text-[12.5px] text-ink-muted mt-0.5 leading-relaxed">
            Ikona na začetnem zaslonu, odpre se čez cel zaslon brez brskalnika.
          </p>
          {mode === "prompt" && (
            <Button size="sm" className="mt-2.5" onClick={() => void install()}>
              Namesti aplikacijo
            </Button>
          )}
          {mode === "android" && (
            <>
              <Button size="sm" className="mt-2.5" onClick={() => setHelp((v) => !v)}>
                Kako namestim
              </Button>
              {help && (
                <p className="mt-2.5 text-[12.5px] text-ink leading-relaxed">
                  V Chromu tapni <strong>⋮</strong> (tri pike zgoraj desno), nato{" "}
                  <strong>»Namesti aplikacijo«</strong> ali <strong>»Dodaj na začetni zaslon«</strong>. Potem odpri
                  Colnix z ikone.
                </p>
              )}
            </>
          )}
          {mode === "ios" && (
            <p className="mt-2 text-[12.5px] text-ink leading-relaxed">
              V Safariju tapni <strong>Deli</strong> (kvadrat s puščico), nato <strong>»Dodaj na začetni zaslon«</strong>.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Skrij"
          onClick={dismiss}
          className="size-7 -mr-1 -mt-1 grid place-items-center rounded-[8px] text-ink-subtle hover:bg-surface"
        >
          <X className="size-4" />
        </button>
      </div>
    </Card>
  );
}
