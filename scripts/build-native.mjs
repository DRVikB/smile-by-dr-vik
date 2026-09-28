import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Package the production web build for Capacitor. Run after `npm run build`,
// which prerenders the app (.next/server/app/index.html) and copies browser
// assets to dist/client. The website build and deployment are unaffected.
const OUT = "dist/native";
const release = process.env.SMILE_RELEASE_BUILD === "1";

// Release builds must carry production purchase/account configuration.
if (release) {
  const problems = [];
  const rcKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
  if (!rcKey) problems.push("NEXT_PUBLIC_REVENUECAT_IOS_API_KEY is not set.");
  else if (rcKey.startsWith("test_")) problems.push("NEXT_PUBLIC_REVENUECAT_IOS_API_KEY is a RevenueCat Test Store key; use the App Store (appl_) key.");
  else if (!rcKey.startsWith("appl_")) problems.push("NEXT_PUBLIC_REVENUECAT_IOS_API_KEY should be the RevenueCat Apple public key (appl_…).");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) problems.push("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  for (const page of ["public/privacy.html", "public/terms.html"]) {
    const pending = (await readFile(page, "utf8").catch(() => "data-required")).match(/data-required/g)?.length ?? 0;
    if (pending) problems.push(`${page} has ${pending} unresolved owner/legal items (see docs/PROFESSIONAL_REVIEW_REQUIRED.md).`);
  }
  if (problems.length) throw new Error(`Release build blocked:\n- ${problems.join("\n- ")}`);
}
const exists = (path) => stat(path).then(() => true, () => false);
if (!(await exists("dist/client/_next/static")) || !(await exists(".next/server/app/index.html")))
  throw new Error("Run `npm run build` before building the native bundle.");

await rm(OUT, { recursive: true, force: true });
await cp("dist/client", OUT, { recursive: true });
await cp(".next/server/app/index.html", `${OUT}/index.html`);
// The app bundles its files, so the website's offline service worker is not needed.
await rm(`${OUT}/sw.js`, { force: true });
await rm(`${OUT}/_headers`, { force: true }); // web hosting config, not app content

let html = await readFile(`${OUT}/index.html`, "utf8");
if (!/SmileCompose/i.test(html)) throw new Error("Prerendered page is invalid.");

// Network allow-list for the app's WebView: itself, the SmileCompose backend
// and the on-device face model's files. This also blocks MediaPipe's default
// usage-metrics upload (odml.pa.googleapis.com). Scripts and images are unaffected.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_SMILE_API_ORIGIN || "https://smile-by-dr-vik.drvik.workers.dev").origin;
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
const connectSrc = ["'self'", "capacitor://localhost", "data:", "blob:", apiOrigin, ...(supabaseOrigin ? [supabaseOrigin] : []),
  "https://cdn.jsdelivr.net", "https://storage.googleapis.com"].join(" ");
html = html.replace(/<head([^>]*)>/i, `<head$1><meta http-equiv="Content-Security-Policy" content="connect-src ${connectSrc}">`);
if (!html.includes("Content-Security-Policy")) throw new Error("Could not add the native network policy.");
await writeFile(`${OUT}/index.html`, html);

// Defence in depth: the client never needs provider credential names, let alone values.
// (MediaPipe legitimately contains the generic "x-goog-api-key" header name for its own telemetry.)
const forbidden = ["SMILE_GEMINI_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "SMILE_PROVIDER_API_KEY", "generativelanguage.googleapis.com", "api.openai.com",
  "SUPABASE_SERVICE_ROLE_KEY", "REVENUECAT_SECRET_API_KEY", "REVENUECAT_WEBHOOK_AUTH", "APPLE_PRIVATE_KEY", "BEGIN PRIVATE KEY"];
// A service-role JWT would carry "service_role" in its payload.
const serviceRoleJwt = /eyJ[\w-]+\.eyJ[\w-]*(c2VydmljZV9yb2xl|NlcnZpY2Vfcm9sZ|zZXJ2aWNlX3JvbG)[\w-]*\./;
async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(html|js|json|css)$/.test(entry.name)) yield path;
  }
}
for await (const path of files(OUT)) {
  const text = await readFile(path, "utf8");
  const hit = forbidden.find((name) => text.includes(name)) ?? (serviceRoleJwt.test(text) ? "a Supabase service-role key" : undefined);
  if (hit) throw new Error(`Native bundle file ${path} references ${hit}; provider access must stay server-side.`);
}
await writeFile(`${OUT}/.native-build`, `${new Date().toISOString()}\n`);
console.log(`Native web bundle ready in ${OUT}; no provider credentials referenced.`);
