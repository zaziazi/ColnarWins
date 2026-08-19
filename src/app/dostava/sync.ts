import { createClient } from "@/lib/supabase/client";
import { confirmDelivery, createSignatureUploadUrl, recordFailedStop, recordLocationPings } from "./actions";
import {
  listPendingActions,
  listPendingPings,
  removePendingAction,
  removePendingPings,
  type PendingAction,
} from "./local-store";

export type SyncedOrder = { orderId: string; type: "confirm" | "fail" };
export type SyncResult = {
  syncedActions: number;
  syncedPings: number;
  failed: number;
  syncedOrders: SyncedOrder[];
};

async function syncOneAction(action: PendingAction): Promise<boolean> {
  if (action.type === "confirm") {
    const upload = await createSignatureUploadUrl(action.orderId);
    if (!upload.ok) return false;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("delivery-signatures")
      .uploadToSignedUrl(upload.path, upload.token, action.signatureBlob);
    if (uploadError) return false;

    const result = await confirmDelivery({
      orderId: action.orderId,
      lines: action.lines.map((l) => ({ productId: l.productId, quantityDelivered: l.quantityDelivered })),
      signaturePath: upload.path,
      signerName: action.signerName,
      note: action.note,
      gpsLat: action.gpsLat,
      gpsLng: action.gpsLng,
      gpsAccuracy: action.gpsAccuracy,
      deviceId: action.deviceId,
    });
    return result.ok;
  }

  const result = await recordFailedStop({ orderId: action.orderId, reason: action.reason });
  return result.ok;
}

/** Drains the offline queue. Safe to call repeatedly — already-synced items are simply not in the queue anymore. */
export async function drainQueue(): Promise<SyncResult> {
  const result: SyncResult = { syncedActions: 0, syncedPings: 0, failed: 0, syncedOrders: [] };
  if (typeof navigator !== "undefined" && !navigator.onLine) return result;

  const actions = await listPendingActions();
  for (const action of actions) {
    const ok = await syncOneAction(action);
    if (ok) {
      await removePendingAction(action.localId);
      result.syncedActions++;
      result.syncedOrders.push({ orderId: action.orderId, type: action.type });
    } else {
      result.failed++;
    }
  }

  const pings = await listPendingPings();
  if (pings.length > 0) {
    const byRoute = new Map<string, typeof pings>();
    for (const p of pings) {
      const list = byRoute.get(p.routeId) ?? [];
      list.push(p);
      byRoute.set(p.routeId, list);
    }
    for (const [routeId, list] of byRoute) {
      const res = await recordLocationPings({
        routeId,
        pings: list.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          deviceId: p.deviceId,
          recordedAt: p.recordedAt,
        })),
      });
      if (res.ok) {
        await removePendingPings(list.map((p) => p.localId));
        result.syncedPings += list.length;
      }
    }
  }

  return result;
}
