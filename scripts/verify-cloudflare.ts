import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSettings } from "../src/lib/types";

async function main() {
  const base = process.env.SMILE_TEST_URL || "http://127.0.0.1:8787";
  const pricing = await fetch(`${base}/api/generation-cost`).then(r => r.json());
  assert.equal(pricing.free, true, "Only run this check against an explicitly mocked Worker; no paid tests.");
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /SMILE/);
  assert.equal((await fetch(base, { method: "HEAD" })).status, 200);
  assert.equal((await fetch(`${base}/api/generate-smile`)).status, 405);
  assert.equal((await fetch(`${base}/missing-page`)).status, 404);
  for (const asset of ["manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "dr-vik-logo.png"]) {
    assert.equal((await fetch(`${base}/${asset}`)).status, 200, asset);
  }
  const sw = await fetch(`${base}/sw.js`);
  assert.equal(sw.headers.get("cache-control"), "no-cache");
  assert.equal(sw.headers.get("service-worker-allowed"), "/");

  const image = `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`;
  const body = JSON.stringify({ originalImage: image, settings: defaultSettings });
  const id = crypto.randomUUID();
  const send = (origin = new URL(base).origin) => fetch(`${base}/api/generate-smile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": origin, "X-Smile-Request-Id": id },
    body,
  });
  assert.equal((await send("https://unrelated.example")).status, 403);
  const concurrent = await Promise.all([send(), send()]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409], "Exactly one concurrent request may proceed.");
  const result = await concurrent.find(r => r.status === 200)!.json();
  assert.equal(result.mode, "mock");
  assert.equal(result.image, image);
  assert.equal((await send()).status, 409, "Repeat requests stay blocked after completion.");
  assert.equal(concurrent[0].headers.get("cache-control"), "no-store");
  console.log("Cloudflare runtime checks passed: page, assets, PWA, API, cross-origin rejection, atomic duplicate protection and mock generation.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
