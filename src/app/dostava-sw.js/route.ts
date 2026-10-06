import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * Served at /dostava-sw.js (this folder name IS the route). Tying the cache
 * name to the real Next.js build id means a new deploy produces different
 * script bytes, which is what makes the browser's normal service-worker
 * update check actually notice a new version — a stale SW silently serving
 * old JS after a deploy, while a driver is genuinely offline, is the classic
 * failure mode here, not the hand-rolling itself.
 */
function getBuildId(): string {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf-8").trim();
  } catch {
    return "dev";
  }
}

export async function GET() {
  const buildId = getBuildId();

  const script = `
const CACHE_NAME = "dostava-shell-${buildId}";
const SCOPE_PATH = "/dostava";

self.addEventListener("install", () => {
  // Deliberately no skipWaiting() — a driver mid-route on an old cached
  // version should not be yanked onto new code out from under them. The new
  // worker sits "waiting" until the page is reloaded.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("dostava-shell-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// Sent by the "Vklopi obvestila" button so a driver turning on notifications
// gets the push-capable worker immediately, not after the next full close.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Colnix", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "driver-plan",
      data: { url: data.url || "/dostava" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dostava";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        if (c.url.includes("/dostava") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.pathname.startsWith(SCOPE_PATH)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw new Error("offline and not cached: " + url.pathname);
      }
    })(),
  );
});
`.trim();

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/dostava/",
    },
  });
}
