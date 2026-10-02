import { test } from "node:test";
import assert from "node:assert/strict";
import { isNativeAppOrigin, preflight, withCors } from "../src/lib/generation/cors";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import { generateSmile, MockSmileProvider } from "../src/lib/generation/provider";
import { SMILE_PROMPT_VERSION, buildSmileGenerationPrompt } from "../src/lib/generation/prompt";
import { apiUrl } from "../src/services/api/client";
import { NATIVE_API_ORIGIN } from "../src/config/app";
import { features } from "../src/config/features";
import { friendlyGenerationError, generateSmileImage, GENERATION_MESSAGES, SmileGenerationError } from "../src/services/ai/smileImageService";
import { onGenerationEvent, type GenerationEvent } from "../src/services/ai/generationEvents";
import { canGenerate, developmentEntitlements, setEntitlementProvider } from "../src/services/entitlements/entitlements";
import { buildCase, summariseCases } from "../src/models/case";
import { saveFile, shareFile } from "../src/lib/share";
import { safeFilename } from "../src/native/share";
import { defaultSettings, type CaseLogEntry, type CaseLogMedia } from "../src/lib/types";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const body = JSON.stringify({ originalImage: png, settings: defaultSettings });

test("only the packaged iOS app origin is granted cross-origin API access", async () => {
  assert.equal(isNativeAppOrigin("capacitor://localhost"), true);
  assert.equal(isNativeAppOrigin("https://evil.example"), false);
  assert.equal(isNativeAppOrigin(null), false);

  const ok = preflight(new Request("https://smile.test/api/generate-smile", { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } }), "POST");
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
  assert.match(ok.headers.get("Access-Control-Allow-Headers") ?? "", /X-Smile-AI-Consent/);
  const denied = preflight(new Request("https://smile.test/api/generate-smile", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), "POST");
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);

  const wrapped = withCors(new Request("https://smile.test/api/x", { headers: { Origin: "https://evil.example" } }), Response.json({}));
  assert.equal(wrapped.headers.get("Access-Control-Allow-Origin"), null);
});

test("the generation handler accepts the iOS app but still rejects other cross-site callers", async () => {
  const request = (origin: string) => new Request("https://smile.test/api/generate-smile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "cross-site", "X-Smile-Request-Id": crypto.randomUUID() },
    body,
  });
  const fromApp = await handleGenerationRequest(request("capacitor://localhost"), { SMILE_PROVIDER: "mock" });
  assert.equal(fromApp.status, 200);
  const fromWeb = await handleGenerationRequest(request("https://evil.example"), { SMILE_PROVIDER: "mock" });
  assert.equal(fromWeb.status, 403);
});

test("an unconfigured live provider reports setup before asking for consent", async () => {
  const response = await handleGenerationRequest(new Request("https://smile.test/api/generate-smile", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID() }, body,
  }), { SMILE_PROVIDER: "gemini" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "provider_not_configured");
});

test("results carry provider, model and prompt-version metadata", async () => {
  const result = await generateSmile({ originalImage: png, settings: defaultSettings, generationMode: "preview" }, undefined, new MockSmileProvider());
  assert.equal(result.generation?.promptVersion, SMILE_PROMPT_VERSION);
  assert.equal(result.generation?.model, "mock");
  assert.equal(result.generation?.mode, "preview");
  assert.ok(Date.parse(result.generation!.generatedAt));
});

test("the prompt frames a concept, protects anatomy and never adds or removes teeth", () => {
  const prompt = buildSmileGenerationPrompt(defaultSettings);
  for (const phrase of ["concept visualisation", "Never add or remove teeth", "eyes, nose, skin, hair", "background, camera perspective", "natural incisal embrasures", "artificial veneer look"])
    assert.ok(prompt.includes(phrase), phrase);
});

test("the website uses relative API URLs and the app uses the hosted backend", () => {
  assert.equal(apiUrl("/api/generate-smile", false), "/api/generate-smile");
  assert.equal(apiUrl("/api/generate-smile", true), `${NATIVE_API_ORIGIN}/api/generate-smile`);
  assert.match(NATIVE_API_ORIGIN, /^https:\/\//);
});

test("unfinished features are off", () => {
  assert.equal(features.photoGeneration, true);
  for (const name of ["smileMotion", "stlImport", "faceCapture", "threeDDesign", "jawMotion", "labExport"] as const)
    assert.equal(features[name], false, name);
});

test("provider errors become clinician-friendly copy without provider details", () => {
  for (const code of ["invalid_api_key", "model_access_required", "provider_unavailable", "provider_not_configured"])
    assert.equal(friendlyGenerationError(503, code).message, GENERATION_MESSAGES.unavailable);
  assert.equal(friendlyGenerationError(504).message, GENERATION_MESSAGES.timeout);
  assert.equal(friendlyGenerationError(422, "image_not_processed").message, GENERATION_MESSAGES.invalidImage);
  assert.equal(friendlyGenerationError(502, "provider_no_image").message, GENERATION_MESSAGES.noImage);
  assert.doesNotMatch(friendlyGenerationError(502, "provider_no_image").message, /well-lit|different photo/);
  assert.equal(friendlyGenerationError(500).message, GENERATION_MESSAGES.failed);
  for (const message of Object.values(GENERATION_MESSAGES)) assert.doesNotMatch(message, /gemini|google|api key|model/i);
});

test("the generation service reports accounting events and only counts successes", async () => {
  const events: GenerationEvent[] = [];
  const stop = onGenerationEvent(e => events.push(e));
  let recorded = 0;
  setEntitlementProvider({ current: developmentEntitlements.current, recordGeneration: async () => { recorded++; } });
  try {
    const request = { caseId: "case-1", originalImage: png, resolution: "1K" as const, settings: defaultSettings, consentVersion: "v1" };
    const result = await generateSmileImage(request, {
      online: () => true,
      fetcher: async (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("X-Smile-AI-Consent"), "v1");
        assert.equal(JSON.parse(String(init?.body)).generationMode, "final");
        return Response.json({ image: png, mode: "live", variationId: "v", generation: { provider: "google", model: "m", promptVersion: "p", generatedAt: new Date().toISOString() } });
      },
    });
    assert.equal(result.mode, "live");
    await assert.rejects(generateSmileImage(request, { online: () => true, fetcher: async () => Response.json({ error: "Upstream API key rejected", code: "invalid_api_key" }, { status: 503 }) }),
      (error: unknown) => error instanceof SmileGenerationError && error.message === GENERATION_MESSAGES.unavailable);
    await assert.rejects(generateSmileImage(request, { online: () => false, fetcher: async () => { throw new Error("must not run"); } }),
      (error: unknown) => error instanceof SmileGenerationError && error.code === "offline");
  } finally {
    stop();
    setEntitlementProvider(developmentEntitlements);
  }
  assert.equal(recorded, 1);
  assert.deepEqual(events.map(e => e.type), ["started", "succeeded", "started", "failed"]);
  assert.equal(events[1].provider, "google");
  assert.equal(events[3].errorCode, "invalid_api_key");
  assert.ok(events.every(e => e.caseId === "case-1" && !("image" in e)));
});

test("an exhausted allowance blocks generation before any request", async () => {
  assert.equal(canGenerate({ isPro: false, plan: "free", generationAllowance: 3, generationBalance: 0 }), false);
  setEntitlementProvider({ current: async () => ({ isPro: false, plan: "free", generationAllowance: 3, generationBalance: 0 }), recordGeneration: async () => {} });
  try {
    await assert.rejects(generateSmileImage({ originalImage: png, resolution: "1K", settings: defaultSettings }, { online: () => true, fetcher: async () => { throw new Error("must not run"); } }),
      (error: unknown) => error instanceof SmileGenerationError && error.code === "allowance_exhausted");
  } finally {
    setEntitlementProvider(developmentEntitlements);
  }
});

test("saved visualisations assemble into cases; legacy entries stand alone", () => {
  const entry = (id: string, createdAt: number, caseId?: string): CaseLogEntry => ({ id, caseId, patientName: caseId ? "A. Patient" : "", createdAt, mode: "live", summary: "", thumb: `thumb-${id}` });
  const entries = [entry("v1", 1, "c1"), entry("v2", 2, "c1"), entry("legacy", 3)];
  const summaries = summariseCases(entries);
  assert.deepEqual(summaries.map(s => [s.id, s.visualisationCount]), [["legacy", 1], ["c1", 2]]);
  const media = new Map<string, CaseLogMedia>([
    ["v1", { id: "v1", image: "after-1", originalImage: "before", preferences: { settings: defaultSettings } }],
    ["v2", { id: "v2", image: "after-2", originalImage: "before", preferences: { settings: { ...defaultSettings, shape: "Square" } } }],
  ]);
  const smileCase = buildCase("c1", entries, media)!;
  assert.equal(smileCase.patient.name, "A. Patient");
  assert.equal(smileCase.captures.photographs.length, 1);
  assert.equal(smileCase.designs.length, 2);
  assert.deepEqual(smileCase.visualisations.map(v => v.image), ["after-1", "after-2"]);
  assert.equal(smileCase.captures.faceScans, undefined);
});

test("web exports keep the browser download; filenames are sanitised for the share sheet", async () => {
  const clicked: string[] = [];
  const doc = globalThis as unknown as { document?: unknown; URL: typeof URL };
  const originalDocument = doc.document;
  const createObjectURL = URL.createObjectURL;
  doc.document = { createElement: () => ({ click() { clicked.push(this.download); }, remove() {}, href: "", download: "" }), body: { appendChild() {} } };
  URL.createObjectURL = () => "blob:test";
  try {
    assert.equal(await saveFile(new Blob(["x"], { type: "image/jpeg" }), "a.jpg", "A", false), "downloaded");
    assert.equal(await shareFile(new Blob(["x"], { type: "image/jpeg" }), "b.jpg", "B", {}, false), "downloaded");
  } finally {
    doc.document = originalDocument;
    URL.createObjectURL = createObjectURL;
  }
  assert.deepEqual(clicked, ["a.jpg", "b.jpg"]);
  assert.equal(safeFilename("Smile / Case: A.jpg"), "Smile-_-Case_-A.jpg");
  assert.equal(safeFilename(""), "smilecompose-export");
});

test("the launch screen shows the SmileCompose symbol, wordmark and Dr Vik signature in Light and Dark", async () => {
  const { readFile, stat } = await import("node:fs/promises");
  const storyboard = await readFile("ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8");
  assert.match(storyboard, /launchScreen="YES"/);
  assert.match(storyboard, /image="LaunchSymbol"/);
  assert.match(storyboard, /image="LaunchSignature"/);
  assert.match(storyboard, /text="S\u2009M\u2009I\u2009L\u2009E\u2009C\u2009O\u2009M\u2009P\u2009O\u2009S\u2009E"/);
  assert.match(storyboard, /text="Designed By"/);
  for (const colour of ["LaunchBackground", "LaunchText", "LaunchSubtle"]) {
    assert.match(storyboard, new RegExp(`name="${colour}"`));
    const set = JSON.parse(await readFile(`ios/App/App/Assets.xcassets/${colour}.colorset/Contents.json`, "utf8")) as { colors: { appearances?: { value: string }[] }[] };
    assert.ok(set.colors.some(c => c.appearances?.some(a => a.value === "dark")), `${colour} has a Dark value`);
  }
  // The launch renderer drew neither asset-catalog images nor attributed text with named colours.
  assert.doesNotMatch(storyboard, /attributedString/);
  const project = await readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  for (const file of ["LaunchSymbol@2x.png", "LaunchSymbol@3x.png", "LaunchSignature@2x.png", "LaunchSignature@3x.png"]) {
    assert.ok((await stat(`ios/App/App/Launch/${file}`)).size > 0, file);
    assert.match(project, new RegExp(`${file.replace(/[.@]/g, "\\$&")} in Resources`));
  }
});
