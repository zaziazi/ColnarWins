"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { removePushSubscription, savePushSubscription } from "./push-actions";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The worker is registered by RouteShell; this makes sure one exists and is active before subscribing. */
async function activeRegistration(swPath: string, scope: string): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(swPath, { scope });
  // An older worker without the push handler may be active — swap it in now,
  // the driver just tapped the button so this is a deliberate moment.
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  if (reg.active) return reg;
  await new Promise<void>((resolve) => {
    const worker = reg.installing ?? reg.waiting;
    if (!worker) return resolve();
    worker.addEventListener("statechange", () => worker.state === "activated" && resolve());
  });
  return reg;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushToggle({
  swPath = "/dostava-sw.js",
  scope = "/dostava/",
  onText = "Ob 17:00 dobiš načrt za jutri",
  offText = "Obvestilo ob 17:00 z načrtom za jutri",
}: {
  swPath?: string;
  scope?: string;
  onText?: string;
  offText?: string;
} = {}) {
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iOS Safari hides the Push API until the app is on the home screen.
        setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration(scope);
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      toast.error("Obvestila še niso nastavljena na strežniku.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await activeRegistration(swPath, scope);
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const json = sub.toJSON();
      const result = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setState("on");
      toast.success("Obvestila vklopljena");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vklop obvestil ni uspel");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(scope);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "needs-install") {
    return (
      <Card className="p-3 mb-4 text-[12.5px] text-ink-muted leading-relaxed">
        Za obvestila na iPhonu: v Safariju tapni »Deli« → »Dodaj na začetni zaslon«, nato odpri
        aplikacijo od tam.
      </Card>
    );
  }

  if (state === "denied") {
    return (
      <Card className="p-3 mb-4 text-[12.5px] text-ink-muted leading-relaxed">
        Obvestila so v nastavitvah telefona izklopljena za to aplikacijo.
      </Card>
    );
  }

  return (
    <Card className="p-3 mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        {state === "on" ? <Bell className="size-4 text-good" /> : <BellOff className="size-4" />}
        {state === "on" ? onText : offText}
      </div>
      {state === "on" ? (
        <Button size="sm" variant="ghost" onClick={() => void disable()} loading={busy}>
          Izklopi
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => void enable()} loading={busy}>
          Vklopi obvestila
        </Button>
      )}
    </Card>
  );
}
