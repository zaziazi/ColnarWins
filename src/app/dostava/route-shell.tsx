"use client";

import * as React from "react";
import { toast } from "sonner";
import { CloudOff, RefreshCw, ChevronRight, Check, X, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { eur } from "@/lib/format";
import { startRoute } from "./actions";
import { StopDetail } from "./stop-detail";
import {
  addPendingAction,
  addPendingPings,
  getDeviceId,
  loadRouteCache,
  saveRouteCache,
  listPendingActions,
} from "./local-store";
import { drainQueue } from "./sync";
import type { DriverRoute, DriverStop } from "@/lib/types";

const STOP_STATUS_LABEL: Record<string, string> = {
  pending: "Čaka",
  arrived: "Prispel",
  completed: "Dostavljeno",
  failed: "Ni dostavljeno",
};

const STOP_STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "danger" | "info"> = {
  pending: "neutral",
  arrived: "info",
  completed: "good",
  failed: "danger",
};

const PING_MIN_INTERVAL_MS = 60_000;

function getPositionOnce(timeoutMs = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function RouteShell({
  initialRoutes,
  date,
}: {
  initialRoutes: DriverRoute[];
  date: string;
}) {
  const [routes, setRoutes] = React.useState<DriverRoute[]>(initialRoutes);
  const [view, setView] = React.useState<"list" | "detail">("list");
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  const [pendingOrderIds, setPendingOrderIds] = React.useState<Set<string>>(new Set());
  const [syncing, setSyncing] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const lastPingRef = React.useRef<number>(0);

  const refreshPendingSet = React.useCallback(async () => {
    const actions = await listPendingActions();
    setPendingOrderIds(new Set(actions.map((a) => a.orderId)));
  }, []);

  const runSync = React.useCallback(async () => {
    setSyncing(true);
    try {
      const result = await drainQueue();
      if (result.syncedActions > 0) {
        toast.success(`Sinhronizirano: ${result.syncedActions}`);
      }
      await refreshPendingSet();
    } finally {
      setSyncing(false);
    }
  }, [refreshPendingSet]);

  // Load whatever's cached; only trust the fresh server copy when nothing is
  // queued locally — a mid-day dispatch refresh must not silently clobber an
  // in-flight offline confirmation.
  React.useEffect(() => {
    (async () => {
      const [cache, actions] = await Promise.all([loadRouteCache(), listPendingActions()]);
      if (cache && cache.date === date && actions.length > 0) {
        setRoutes(cache.routes);
      } else {
        await saveRouteCache({ date, staffId: "", routes: initialRoutes, cachedAt: new Date().toISOString() });
      }
      setPendingOrderIds(new Set(actions.map((a) => a.orderId)));
      setReady(true);
      void runSync();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Register the offline shell's service worker once.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/dostava-sw.js", { scope: "/dostava/" })
      .then((registration) => {
        const notifyIfWaiting = () => {
          if (registration.waiting) {
            toast.info("Na voljo je nova različica — znova naloži, ko boš spet online");
          }
        };
        notifyIfWaiting();
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", notifyIfWaiting);
        });
      })
      .catch(() => {});
  }, []);

  // Sync on reconnect, periodically, and when the tab regains focus.
  React.useEffect(() => {
    const onOnline = () => void runSync();
    const onVisible = () => document.visibilityState === "visible" && void runSync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => void runSync(), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [runSync]);

  // GPS tracking — foreground only, while any route is in_progress. Queued
  // locally like everything else; the periodic sync above flushes it.
  React.useEffect(() => {
    const activeRoute = routes.find((r) => r.status === "in_progress");
    if (!activeRoute || typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPingRef.current < PING_MIN_INTERVAL_MS) return;
        lastPingRef.current = now;
        void addPendingPings([
          {
            localId: crypto.randomUUID(),
            routeId: activeRoute.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? null,
            deviceId: getDeviceId(),
            recordedAt: new Date(pos.timestamp).toISOString(),
          },
        ]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [routes]);

  async function handleStartRoute(routeId: string) {
    const result = await startRoute(routeId);
    if (!result.ok) {
      toast.error(result.error ?? "Poti ni bilo mogoče začeti");
      return;
    }
    setRoutes((rs) => rs.map((r) => (r.id === routeId ? { ...r, status: "in_progress" } : r)));
    toast.success("Pot začeta");
  }

  async function handleConfirm(
    stop: DriverStop,
    args: {
      lines: { productId: string; quantityDelivered: number }[];
      signerName: string;
      note: string;
      signatureBlob: Blob;
    },
  ) {
    const pos = await getPositionOnce();
    await addPendingAction({
      localId: crypto.randomUUID(),
      type: "confirm",
      orderId: stop.orderId,
      lines: args.lines,
      signatureBlob: args.signatureBlob,
      signerName: args.signerName,
      note: args.note,
      gpsLat: pos?.coords.latitude ?? null,
      gpsLng: pos?.coords.longitude ?? null,
      gpsAccuracy: pos?.coords.accuracy ?? null,
      deviceId: getDeviceId(),
      queuedAt: new Date().toISOString(),
    });
    await refreshPendingSet();
    setView("list");
    toast.success(navigator.onLine ? "Dostava se sinhronizira…" : "Dostava shranjena — sinhronizirano bo ob signalu");
    void runSync();
  }

  async function handleFail(stop: DriverStop, reason: string) {
    await addPendingAction({
      localId: crypto.randomUUID(),
      type: "fail",
      orderId: stop.orderId,
      reason,
      queuedAt: new Date().toISOString(),
    });
    await refreshPendingSet();
    setView("list");
    toast.success("Zabeleženo");
    void runSync();
  }

  if (!ready) {
    return <Card className="p-7 text-center"><p className="text-[13px] text-ink-muted">Nalaganje…</p></Card>;
  }

  if (view === "detail" && selectedOrderId) {
    const stop = routes.flatMap((r) => r.stops).find((s) => s.orderId === selectedOrderId);
    if (!stop) {
      setView("list");
      return null;
    }
    return (
      <StopDetail
        stop={stop}
        pending={pendingOrderIds.has(stop.orderId)}
        onBack={() => setView("list")}
        onConfirm={(args) => void handleConfirm(stop, args)}
        onFail={(reason) => void handleFail(stop, reason)}
      />
    );
  }

  return (
    <div>
      {pendingOrderIds.size > 0 && (
        <Card className="p-3 mb-4 flex items-center justify-between gap-3 bg-warn-soft border-warn/20">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-warn">
            <CloudOff className="size-4 shrink-0" />
            {pendingOrderIds.size} čaka na sinhronizacijo
          </div>
          <Button size="sm" variant="secondary" onClick={() => void runSync()} loading={syncing}>
            <RefreshCw className="size-3.5" /> Sinhroniziraj
          </Button>
        </Card>
      )}

      {routes.length === 0 && (
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Za danes nimaš dodeljene poti.</p>
        </Card>
      )}

      {routes.map((route) => (
        <div key={route.id} className="mb-6">
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">{route.vehicle}</h2>
            {route.status === "planned" && (
              <Button size="sm" onClick={() => void handleStartRoute(route.id)}>
                <Navigation className="size-3.5" /> Začni pot
              </Button>
            )}
            {route.status === "in_progress" && <Badge tone="warn">V teku</Badge>}
            {route.status === "completed" && <Badge tone="good">Zaključeno</Badge>}
          </div>

          <div className="space-y-2.5">
            {route.stops.map((stop, i) => {
              const isPending = pendingOrderIds.has(stop.orderId);
              const isTerminal = stop.status === "completed" || stop.status === "failed";
              const statusLabel = isPending ? "Čaka na sinhronizacijo" : STOP_STATUS_LABEL[stop.status];
              const statusTone = isPending ? "warn" : STOP_STATUS_TONE[stop.status];

              return (
                <button
                  key={stop.id}
                  type="button"
                  disabled={isTerminal && !isPending}
                  onClick={() => {
                    setSelectedOrderId(stop.orderId);
                    setView("detail");
                  }}
                  className="w-full text-left disabled:cursor-default"
                >
                  <Card
                    className={
                      "p-3.5 flex items-center gap-3 transition-colors" +
                      (!isTerminal || isPending ? " hover:border-line-strong" : "")
                    }
                  >
                    <span className="text-[11px] font-bold text-ink-subtle w-4 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[15px] truncate">{stop.customerName}</h3>
                      <p className="text-[11.5px] text-ink-subtle truncate mt-0.5">
                        {[stop.address, stop.city].filter(Boolean).join(", ") || "—"}
                        {stop.deliveryNotes && ` · ${stop.deliveryNotes}`}
                      </p>
                      <p className="text-[12.5px] font-semibold tabular mt-1">{eur(stop.totalGross)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                      {stop.status === "completed" ? (
                        <Check className="size-4 text-good" />
                      ) : stop.status === "failed" ? (
                        <X className="size-4 text-danger" />
                      ) : (
                        <ChevronRight className="size-4 text-ink-subtle" />
                      )}
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
