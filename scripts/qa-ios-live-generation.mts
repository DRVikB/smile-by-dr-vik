/** Explicit, loopback-only live QA. Never imported by normal test/build commands. */
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import sharp from "sharp";
import { AI_CONSENT_VERSION } from "../src/lib/aiConsent";
import { defaultSettings, upperTeeth } from "../src/lib/types";
import { chooseFullArch } from "../src/lib/fullArch";
import { generationCanvas } from "../src/lib/generationCanvas";
const root = process.cwd(), out = resolve(root, "output/simulator-reliability-2026-10-03"), origin = "https://smile-by-dr-vik-staging.drvik.workers.dev";
const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? "3");
const importsOnly = process.argv.includes("--imports-only");
if (!Number.isInteger(count) || count < 1 || count > 6) throw Error("Use --count=1 through --count=6");
// Folder photographs are enabled only by an explicit invocation following the
// owner's 3 October authorization; never selected by normal QA or app builds.
const testPhoto = process.argv.find(a => a.startsWith("--test-photo="))?.slice(13);
if (testPhoto && !["IMG_3291.jpg", "IMG_3293.jpg", "IMG_3296.jpg", "IMG_3297.jpg", "IMG_3241.jpg"].includes(testPhoto)) throw Error("Use an explicitly authorized test-folder JPEG");
const source = await fs.readFile(resolve(root, testPhoto ? "test images/" + testPhoto : "output/stage3-evidence/generation-source.jpg"));
const sourceHash = createHash("sha256").update(source).digest("hex");
if (!testPhoto && sourceHash !== "1f54f12c302287ce3dcef8701614ebd42130e9a078ec22e062214d09a23b1ee6") throw Error("Approved synthetic source fingerprint mismatch");
const sourceMetadata = await sharp(source).metadata();
if (!sourceMetadata.width || !sourceMetadata.height) throw Error("Source dimensions unavailable");
const session = JSON.parse(await fs.readFile(resolve(out, "qa-credentials.json"), "utf8"));
if (!session.email?.startsWith("smile-") || !session.email.endsWith("@example.invalid") || session.id !== "f0c28d4e-cd21-4d0d-93a7-8a7a7d54068a") throw Error("A disposable staging fixture is required");
// Renew this disposable fixture through ordinary authenticated-user refresh only.
const configEnv = await fs.readFile(resolve(root, ".env.local"), "utf8");
const configValue = (name: string) => configEnv.match(new RegExp("^" + name + "=(.*)$", "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const anon = configValue("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? configValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!anon) throw Error("Public staging auth configuration missing");
const refresh = await fetch("https://wukcqlpuzkzwxmdkotfg.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh }) });
if (!refresh.ok) throw Error("Disposable QA session refresh failed: HTTP " + refresh.status);
const renewed = await refresh.json(); session.token = renewed.access_token; session.refresh = renewed.refresh_token;
await fs.writeFile(resolve(out, "qa-credentials.json"), JSON.stringify(session), { mode: 0o600 });
const composite = { ...defaultSettings, teeth: 6 as const, selectedTeeth: upperTeeth[6], treatment: "Single-shade composite" as const, libraryStyle: false };
const mode = process.argv.find(a => a.startsWith("--mode="))?.slice(7);
if (mode && !["alignment", "full_arch"].includes(mode)) throw Error("Use --mode=alignment or --mode=full_arch");
const settings = mode ? Array.from({ length: count }, () => mode === "alignment" ? { ...composite, alignment: { arches: "Both" as const, only: true } } : chooseFullArch({ ...composite, targetShade: "B1" }, { arch: "upper", prostheticGingiva: "exclude" })) : process.argv.includes("--suite=treatments") ? [
  composite, { ...composite, treatment: "Whitening" as const, targetShade: "Whiten" as const },
  { ...composite, treatment: "Porcelain" as const, targetShade: "B1" as const },
  { ...composite, alignment: { arches: "Both" as const, only: true } },
  chooseFullArch({ ...composite, targetShade: "B1" }, { arch: "upper", prostheticGingiva: "exclude" }),
  chooseFullArch({ ...composite, targetShade: "B1" }, { arch: "upper", prostheticGingiva: "include" }),
].slice(0, count) : Array.from({ length: count }, () => composite);
await fs.mkdir(out, { recursive: true, mode: 0o700 });
await build({ entryPoints: [importsOnly ? "tests/ios/import-harness.ts" : "tests/ios/live-harness.ts"], bundle: true, format: "esm", outfile: resolve(out, "live-harness.js"), define: { "process.env": '{}', "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE": '"0"' }, logLevel: "warning" });
const cases = new Set<string>(), used = new Set<string>();
const replayFolder = process.argv.includes("--replay-full-arch");
const replay = process.argv.includes("--replay-existing") || replayFolder;
if (replayFolder && (testPhoto !== "IMG_3297.jpg" || mode !== "full_arch" || count !== 1)) throw Error("Folder replay requires the existing authorised Upper Full Arch fixture and count=1");
if (replay && testPhoto && !replayFolder) throw Error("Synthetic replay cannot be used for another person's photograph");
const replayIds = ["041f7492-4eb2-4e37-83a7-4d79a04fc1a1", "b9c13a97-31eb-4014-ba1c-1aa1e0c3e183", "6a7478a8-92d4-4436-8820-f3dc3e4a8150", "dc21b24d-3e86-4b08-abf6-cab040a89b1a", "efbe4eff-135b-4e86-9c18-fe94cab4bd83", "aaab989b-00cf-49d2-9c5e-a292656495c9"];
async function status() { const r = await fetch(origin + "/api/account/status", { headers: { Authorization: `Bearer ${session.token}` } }); if (!r.ok) throw Error("Disposable session/status HTTP " + r.status); return (await r.json()).generations; }
async function readBody(req: AsyncIterable<Buffer>) { let body = ""; for await (const b of req) { body += b; if (body.length > 24_000_000) throw Error("QA body limit"); } return JSON.parse(body); }
function dataBytes(value: string) { if (!/^data:image\/(jpeg|png);base64,/.test(value)) throw Error("Image data required"); return Buffer.from(value.split(",")[1], "base64"); }
const uuid = /^[a-f0-9-]{36}$/i;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:3100"), p = url.pathname;
    if (req.headers.origin && req.headers.origin !== "http://127.0.0.1:3100") { res.writeHead(403); res.end(); return; }
    res.setHeader("Cache-Control", "no-store");
    if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (p === "/config") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ owner: session.id, count, settings })); return; }
    if (p === "/source.jpg") { res.setHeader("Content-Type", "image/jpeg"); res.end(source); return; }
    if (importsOnly && p.startsWith("/test-input/")) { const name = decodeURIComponent(p.slice(12)); if (!["IMG_3291.jpg", "IMG_3293.jpg", "IMG_3296.jpg", "IMG_3297.jpg", "IMG_3241.jpg", "IMG_3166 2.HEIC"].includes(name)) throw Error("Unknown fixture"); res.setHeader("Content-Type", name.endsWith(".HEIC") ? "image/heic" : "image/jpeg"); res.end(await fs.readFile(resolve(root, "test images", name))); return; }
    if (importsOnly && p === "/import-receipt" && req.method === "POST") { await fs.writeFile(resolve(out, "test-folder-imports.json"), JSON.stringify(await readBody(req), null, 2), { mode: 0o600 }); res.end("saved"); return; }
    if (p === "/generate" && req.method === "POST") {
      if (importsOnly) throw Error("Provider calls are disabled for local import checks");
      if (used.size >= count) throw Error("This live invocation's request budget is exhausted");
      const body = await readBody(req);
      if (!uuid.test(body.requestId) || used.has(body.requestId) || !uuid.test(body.caseId) || JSON.stringify(body.settings) !== JSON.stringify(settings[used.size]) || body.referenceImage || body.editMask) throw Error("Unexpected QA request");
      const bytes = dataBytes(body.originalImage), dims = await sharp(bytes).metadata(), canvas = generationCanvas(sourceMetadata.width!, sourceMetadata.height!);
      if (dims.width !== canvas.width || dims.height !== canvas.height || JSON.stringify(body.sourceBounds) !== JSON.stringify(canvas.sourceBounds)) throw Error("Source geometry mismatch");
      const expected = await sharp(source).removeAlpha().raw().toBuffer();
      const actual = await sharp(bytes).extract({ left: Math.round(canvas.sourceBounds.x * canvas.width), top: Math.round(canvas.sourceBounds.y * canvas.height), width: sourceMetadata.width!, height: sourceMetadata.height! }).removeAlpha().raw().toBuffer();
      let diff=0; for(let i=0;i<expected.length;i++) diff+=Math.abs(actual[i]-expected[i]);
      if(actual.length!==expected.length || diff/expected.length>3) throw Error("Provider input does not match the authorised QA photograph");
      used.add(body.requestId); cases.add(body.caseId); const dir = resolve(out,"live",body.requestId); await fs.mkdir(dir,{recursive:true,mode:0o700});
      await fs.writeFile(resolve(dir,"original.jpg"),source,{mode:0o600}); await fs.writeFile(resolve(dir,"prepared.jpg"),bytes,{mode:0o600});
      if (replay) {
        const prior = resolve(out, "live", replayFolder ? "628e0af2-a36c-4acd-99e8-3d5b6170817d" : replayIds[used.size - 1]);
        const raw = await fs.readFile(resolve(prior, "raw.jpg"));
        const recorded = JSON.parse(await fs.readFile(resolve(prior, "provider.json"), "utf8"));
        await fs.writeFile(resolve(dir, "raw.jpg"), raw, { mode: 0o600 });
        await fs.writeFile(resolve(dir, "provider.json"), JSON.stringify({ requestId: body.requestId, replayOf: recorded.requestId, httpStatus: 200, provider: recorded.provider, noProviderRequest: true }), { mode: 0o600 });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ image: "data:image/jpeg;base64," + raw.toString("base64"), mode: "live", variationId: body.requestId, providerDiagnostic: recorded.provider })); return;
      }
      const before = await status(), started = Date.now();
      const r=await fetch(origin+"/api/generate-smile",{method:"POST",headers:{Authorization:`Bearer ${session.token}`,"Content-Type":"application/json","X-Smile-Request-Id":body.requestId,"X-Smile-AI-Consent":AI_CONSENT_VERSION},body:JSON.stringify(body),signal:AbortSignal.timeout(260000)});
      const result=await r.json(),after=await status();
      if(result.image)await fs.writeFile(resolve(dir,"raw."+(result.image.startsWith("data:image/png")?"png":"jpg")),dataBytes(result.image),{mode:0o600});
      const receipt={requestId:body.requestId,sourceHash,sourceType:testPhoto?"owner-authorized-test-folder":"approved-synthetic",httpStatus:r.status,provider:result.providerDiagnostic??null,allowanceBefore:before,allowanceAfter:after,durationMs:Date.now()-started,error:result.code??null};
      await fs.writeFile(resolve(dir,"provider.json"),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));
      res.writeHead(r.status,{"Content-Type":"application/json"});res.end(JSON.stringify(result));return;
    }
    if (["/receipt","/final","/relaunch-receipt"].includes(p) && req.method === "POST") {
      const b = await readBody(req);if(p==="/relaunch-receipt")await fs.writeFile(resolve(out,"live-relaunch.json"),JSON.stringify(b),{mode:0o600});
      else {if(!used.has(b.requestId))throw Error("Unknown request lineage");const dir=resolve(out,"live",b.requestId);await fs.writeFile(resolve(dir,p==="/final"?"final.png":"processing.json"),p==="/final"?dataBytes(b.image):JSON.stringify(b,null,2),{mode:0o600});}
      res.end("saved");return;
    }
    if(p.startsWith("/api/patient-cases")) {
      // Uses the normal authenticated API, never a service-role credential.
      const body=req.method==="GET"?undefined:Buffer.concat(await Array.fromAsync(req));
      const r=await fetch(origin+url.pathname+url.search,{method:req.method,headers:{Authorization:`Bearer ${session.token}`,...(req.headers["content-type"]?{"Content-Type":req.headers["content-type"]}: {})},body});
      res.writeHead(r.status,{"Content-Type":r.headers.get("content-type")??"application/json"});res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    if(p==="/") { res.setHeader("Content-Type","text/html");res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>SmileCompose private staging QA</title></head><body><h1>Authorised staging QA</h1><button id="run">Run live generations</button><button id="verify">Verify saved results after relaunch</button><p role="status">Ready</p><div id="results"></div><pre></pre><script type="module" src="/live-harness.js"></script></body></html>');return; }
    const path=p==="/live-harness.js"?resolve(out,"live-harness.js"):resolve(root,"public",p.slice(1));
    if(!path.startsWith(resolve(root,"public")+"/") && path!==resolve(out,"live-harness.js"))throw Error("Unknown path");
    res.setHeader("Content-Type",({".js":"text/javascript",".wasm":"application/wasm",".jpg":"image/jpeg"})[extname(path)]??"application/octet-stream");res.end(await fs.readFile(path));
  }catch(e){res.writeHead(502,{"Content-Type":"application/json"});res.end(JSON.stringify({code:"qa_harness_failed"}));console.error("QA failed:",e instanceof Error?e.message:"unknown");}
});
server.listen(3100,"127.0.0.1",()=>console.log(importsOnly ? "Local import QA ready: http://127.0.0.1:3100 (provider disabled)" : `Explicit staging QA ready: http://127.0.0.1:3100 (${count} requests maximum)` ));
