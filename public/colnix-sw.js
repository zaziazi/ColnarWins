// Root service worker: makes Colnix installable on Android and shows a friendly page when offline.
// It never caches app pages or data; the offline driver shell has its own worker under /dostava/.
const OFFLINE_HTML =
  '<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Colnix</title><style>body{font-family:system-ui,sans-serif;background:#f6f3ef;color:#231a1c;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}" +
  "h1{font-size:20px;margin:0 0 8px}p{color:#6b5c5f;font-size:14px;margin:0 0 16px}button{background:#7a1230;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600}</style></head>" +
  '<body><div><h1>Ni povezave</h1><p>Colnix potrebuje internet. Preveri signal in poskusi znova.</p><button onclick="location.reload()">Poskusi znova</button></div></body></html>';

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // everything else goes straight to the network
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
