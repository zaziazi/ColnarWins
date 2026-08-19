import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DriverRoute } from "@/lib/types";

export interface RouteCache {
  key: "cache";
  date: string;
  staffId: string;
  routes: DriverRoute[];
  cachedAt: string;
}

export interface PendingLine {
  productId: string;
  quantityDelivered: number;
}

export type PendingAction =
  | {
      localId: string;
      type: "confirm";
      orderId: string;
      lines: PendingLine[];
      signatureBlob: Blob;
      signerName: string;
      note: string;
      gpsLat: number | null;
      gpsLng: number | null;
      gpsAccuracy: number | null;
      deviceId: string;
      queuedAt: string;
    }
  | {
      localId: string;
      type: "fail";
      orderId: string;
      reason: string;
      queuedAt: string;
    };

export interface PendingPing {
  localId: string;
  routeId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  deviceId: string;
  recordedAt: string;
}

interface DostavaDB extends DBSchema {
  route: { key: string; value: RouteCache };
  pendingActions: { key: string; value: PendingAction };
  pendingPings: { key: string; value: PendingPing };
}

let dbPromise: Promise<IDBPDatabase<DostavaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DostavaDB>("dostava-db", 1, {
      upgrade(db) {
        db.createObjectStore("route", { keyPath: "key" });
        db.createObjectStore("pendingActions", { keyPath: "localId" });
        db.createObjectStore("pendingPings", { keyPath: "localId" });
      },
    });
  }
  return dbPromise;
}

export async function saveRouteCache(cache: Omit<RouteCache, "key">): Promise<void> {
  const db = await getDb();
  await db.put("route", { ...cache, key: "cache" });
}

export async function loadRouteCache(): Promise<RouteCache | null> {
  const db = await getDb();
  return (await db.get("route", "cache")) ?? null;
}

export async function addPendingAction(action: PendingAction): Promise<void> {
  const db = await getDb();
  await db.put("pendingActions", action);
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const db = await getDb();
  return db.getAll("pendingActions");
}

export async function removePendingAction(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingActions", localId);
}

export async function pendingActionForOrder(orderId: string): Promise<PendingAction | undefined> {
  const actions = await listPendingActions();
  return actions.find((a) => a.orderId === orderId);
}

export async function addPendingPings(pings: PendingPing[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("pendingPings", "readwrite");
  await Promise.all(pings.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function listPendingPings(): Promise<PendingPing[]> {
  const db = await getDb();
  return db.getAll("pendingPings");
}

export async function removePendingPings(localIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("pendingPings", "readwrite");
  await Promise.all(localIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Stable per-browser device id, persisted once — used to attribute proof/pings to this phone. */
export function getDeviceId(): string {
  const KEY = "dostava-device-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
