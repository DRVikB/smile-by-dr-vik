/* Only the build-time public shell, hashed scripts/styles/fonts and bundled examples/branding are cached.
 * Patient data stays in the account-isolated repository, never this shared cache. */
const PREFIX = "smilecompose-public-shell-v1-";
const SHELL = "/offline-shell.html";
const staticPath = (path) => /^\/_next\/static\/[A-Za-z0-9_./-]+\.(js|css|woff2?)$/.test(path) && !path.includes("..");
const runtimePaths = new Set(['/vision/face-worker.js', '/vision/heic-worker.js', '/vision/vision_wasm_internal.js', '/vision/vision_wasm_internal.wasm', '/models/face/face_landmarker.task', '/models/slimsam/onnx/vision_encoder_quantized.onnx', '/models/slimsam/onnx/prompt_encoder_mask_decoder_quantized.onnx', '/ort/sam-worker.js', '/ort/ort-wasm-simd-threaded.wasm', '/ort/ort-wasm-simd-threaded.mjs']);
const publicPath = (path) => staticPath(path) || runtimePaths.has(path) || (!path.includes("..") && (/^\/brand\/[A-Za-z0-9_./-]+\.(png|svg|webp)$/.test(path) || /^\/(examples|demo-results)\/[A-Za-z0-9_.-]+\.webp$/.test(path) || ["/dr-vik-logo.png", "/smile-hero-dr-vik-v2.webp", "/demo-storyboard-before.webp"].includes(path)));
let warming;
function warmShell() {
  if (warming) return warming;
  warming = (async () => {
    const response = await fetch("/offline-assets.json", { credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error("Offline manifest unavailable");
    const manifest = await response.json();
    if (!/^[a-f0-9]{20}$/.test(manifest.version) || !Array.isArray(manifest.assets) || manifest.assets.length > 1000 || !manifest.assets.every(publicPath)) throw new Error("Invalid public shell manifest");
    const name = PREFIX + manifest.version;
    const cache = await caches.open(name);
    if (!(await cache.match(SHELL))) {
      // Store the shell last: an interrupted update must never become the fallback.
      for (const path of manifest.assets) {
        if (await cache.match(path)) continue;
        const asset = await fetch(path, { credentials: "omit", cache: "reload" });
        if (!asset.ok) throw new Error("Public asset unavailable");
        await cache.put(path, asset);
      }
      const shell = await fetch(SHELL, { credentials: "omit", cache: "reload" });
      if (!shell.ok || !(shell.headers.get("Content-Type") || "").includes("text/html")) throw new Error("Public shell unavailable");
      await cache.put(SHELL, shell);
      for (const old of await caches.keys()) if (old.startsWith(PREFIX) && old !== name) await caches.delete(old);
    }
  })().finally(() => { warming = undefined; });
  return warming;
}
async function cached(path) {
  for (const name of (await caches.keys()).reverse()) {
    if (!name.startsWith(PREFIX)) continue;
    const response = await (await caches.open(name)).match(path);
    if (response) return response;
  }
}
self.addEventListener("install", (event) => {
  event.waitUntil(warmShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/") {
    event.waitUntil(warmShell().catch(() => {}));
    event.respondWith(fetch(event.request).catch(async () => (await cached(SHELL)) || new Response("You’re offline. Open SmileCompose online once to prepare this device for offline use.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
  } else if (!url.search && publicPath(url.pathname)) {
    event.respondWith(cached(url.pathname).then((response) => response || fetch(event.request)));
  }
  // API responses, patient images, avatars, external URLs and other pages are never cached.
});
