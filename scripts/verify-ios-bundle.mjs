import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { configuredSecrets, clientSecretIssue } from "./client-secrets.mjs";

// Verifies the web bundle Capacitor copied into the iOS app (run after `cap sync ios`).
//  - removes file-sync duplicates ("chunk 2.js") that iCloud Drive creates in
//    ~/Documents, so no stale copies ship in the app
//  - checks app ID / name, the entry page, no placeholder config, no private
//    secrets, and (release builds) the production account configuration.
const PUBLIC = "ios/App/App/public";
const release = process.env.SMILE_RELEASE_BUILD === "1";
const problems = [];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}
const exists = path => stat(path).then(() => true, () => false);

if (!(await exists(`${PUBLIC}/index.html`))) {
  console.error(`No ${PUBLIC}/index.html. Run \`npm run ios:sync\`.`);
  process.exit(1);
}

let removed = 0;
// Also the Capacitor-generated files next to the bundle (config.xml, capacitor.config.json).
const generated = ["ios/App/App/config.xml", "ios/App/App/capacitor.config.json"];
for (const entry of await readdir("ios/App/App")) {
  const m = entry.match(/^(.*) \d+(\.[^.]+)$/);
  if (m && generated.includes(`ios/App/App/${m[1]}${m[2]}`)) { await rm(`ios/App/App/${entry}`); removed += 1; }
}
for (const file of await walk(PUBLIC)) {
  const m = file.match(/^(.*) \d+(\.[^./]+)?$/);
  if (m && await exists(`${m[1]}${m[2] ?? ""}`)) { await rm(file); removed += 1; }
}

const config = JSON.parse(await readFile("ios/App/App/capacitor.config.json", "utf8"));
if (config.appId !== "uk.co.drvik.smilecompose") problems.push(`appId is ${config.appId}`);
if (config.appName !== "SmileCompose") problems.push(`appName is ${config.appName}`);
if (config.server?.url) problems.push(`server.url is set (${config.server.url}): the app must load its bundled files, not a dev server`);

const text = (await Promise.all((await walk(PUBLIC)).filter(f => /\.(js|html|json|css|txt)$/.test(f)).map(f => readFile(f, "utf8")))).join("\n");
const secretIssue = clientSecretIssue(text, await configuredSecrets());
if (secretIssue) problems.push(`bundle contains a ${secretIssue}`);
const html = await readFile(`${PUBLIC}/index.html`, "utf8");
if (!html.includes("script-src 'self' 'wasm-unsafe-eval'") || /script-src[^;]*'unsafe-(?:inline|eval)'/.test(html)) problems.push("strict native script policy missing");
for (const path of ['vision/heic-worker.js', 'vision/face-worker.js', 'vision/vision_wasm_internal.js', 'vision/vision_wasm_internal.wasm', 'models/face/face_landmarker.task', 'ort/sam-worker.js'])
  if (!(await exists(`${PUBLIC}/${path}`))) problems.push(`bundled runtime missing: ${path}`);
if (text.includes("placeholder-project")) problems.push("bundle was built with placeholder Supabase configuration");

const accounts = /https:\/\/[a-z0-9-]+\.supabase\.co/.test(text);
if (release) {
  if (!accounts) problems.push("release build has no Supabase project URL (NEXT_PUBLIC_SUPABASE_URL)");
  if (!/appl_[A-Za-z0-9]{10,}/.test(text)) problems.push("release build has no RevenueCat Apple public key (NEXT_PUBLIC_REVENUECAT_IOS_API_KEY)");
}

console.log(`iOS bundle: ${removed} sync-duplicate file${removed === 1 ? "" : "s"} removed; accounts ${accounts ? "configured" : "NOT configured (sign-in, subscriptions and generation will be unavailable)"}.`);
if (problems.length) {
  console.error(`iOS bundle check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("iOS bundle check passed.");
