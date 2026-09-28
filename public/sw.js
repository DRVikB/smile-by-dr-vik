/* Network-only: never cache authenticated pages, API requests or patient images. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#FAF9F6"><title>SmileCompose</title><body style="margin:0;padding:32px;background:#FAF9F6;color:#3C3C3C;font:18px system-ui;min-height:80vh;display:grid;place-content:center"><main><h1 style="letter-spacing:.12em;font-weight:400">SMILECOMPOSE</h1><p>You’re offline.</p><p>Reconnect to reopen your saved case and create a preview.</p><a href="/" style="color:#3C3C3C;display:inline-block;padding:16px 0">Try again</a></main></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  )));
});
