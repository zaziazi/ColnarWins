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
