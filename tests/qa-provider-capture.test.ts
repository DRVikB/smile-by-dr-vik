import { test } from "node:test";
import assert from "node:assert/strict";
import { qaCaptureAuthorization, qaSettingsSha256, qaSourceSha256 } from "../src/lib/generation/qaCapture";
import { GeminiSmileProvider } from "../src/lib/generation/gemini";
import { defaultSettings } from "../src/lib/types";
import { generationSchema } from "../src/lib/generation/schema";
import { generateSmileImage } from "../src/services/ai/smileImageService";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const input = generationSchema.parse({ originalImage: image, settings: { ...defaultSettings, libraryStyle: false } });
const owner = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const url = "https://smile-by-dr-vik-staging.drvik.workers.dev/api/generate-smile";

async function approvedEnvironment() {
  return { SMILE_QA_CAPTURE_ENABLED: "1", SMILE_QA_CAPTURE_RUN_ID: runId,
    SMILE_QA_CAPTURE_REQUEST_ID: requestId, SMILE_QA_CAPTURE_USER_ID: owner,
    SMILE_QA_CAPTURE_SOURCE_SHA256: await qaSourceSha256(image),
    SMILE_QA_CAPTURE_SETTINGS_SHA256: await qaSettingsSha256(input.settings),
    SUPABASE_URL: "https://wukcqlpuzkzwxmdkotfg.supabase.co", SMILE_PROVIDER: "gemini", SMILE_MASK_GUIDANCE: "off" };
}

test("private QA capture requires staging, exact owner/request/source/settings and explicit opt-in", async () => {
  const env = await approvedEnvironment();
  assert.equal((await qaCaptureAuthorization(url, env, owner, requestId, input)).state, "approved");
  assert.equal((await qaCaptureAuthorization(url, {}, owner, requestId, input)).state, "off");
  assert.equal((await qaCaptureAuthorization(url, env, crypto.randomUUID(), requestId, input)).state, "off");
  for (const [testUrl, testEnv, id, value] of [
    ["https://smile-by-dr-vik.drvik.workers.dev/api/generate-smile", env, requestId, input],
    [url, { ...env, SMILE_QA_CAPTURE_RUN_ID: "bad" }, requestId, input],
    [url, { ...env, SUPABASE_URL: "https://production.supabase.co" }, requestId, input],
    [url, { ...env, SMILE_MASK_GUIDANCE: "on" }, requestId, input],
    [url, env, crypto.randomUUID(), input],
    [url, env, requestId, { ...input, originalImage: image.replace("fDwA", "fDwB") }],
    [url, env, requestId, { ...input, settings: { ...input.settings, intensity: 66 } }],
    [url, env, requestId, { ...input, referenceImage: image }],
    [url, env, requestId, { ...input, styleReferences: [image] }],
    [url, env, requestId, { ...input, settings: { ...input.settings, libraryStyle: true } }],
  ] as Array<[string, typeof env, string, typeof input]>) assert.equal((await qaCaptureAuthorization(testUrl, testEnv, owner, id, value)).state, "rejected");
});

test("private part callback precedes parser rejection and excludes text/signatures", async () => {
  let retained: unknown;
  let calls = 0;
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => {
    calls++;
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, thoughtSignature: "opaque-secret", inlineData: { mimeType: "image/png", data: image.split(",")[1] } },
      { text: "sensitive-text", thoughtSignature: "opaque-secret" },
      { inlineData: { mimeType: "image/png", data: image.split(",")[1] } },
      { inlineData: { mimeType: "image/png", data: image.split(",")[1] } },
    ] } }] });
  } });
  await assert.rejects(provider.generate(input, undefined, {
    update: () => {}, captureImageParts: parts => { retained = parts; },
  }), /more than one finished preview/);
  const parts = retained as Array<Record<string, unknown>>;
  assert.equal(calls, 1);
  assert.deepEqual(parts.map(p => [p.candidateIndex, p.partIndex, p.thought, p.selected]), [[0, 0, true, false], [0, 2, false, false], [0, 3, false, false]]);
  assert.equal(parts[0].image, image);
  assert.equal(JSON.stringify(parts).includes("opaque-secret"), false);
  assert.equal(JSON.stringify(parts).includes("sensitive-text"), false);
});

test("capture write errors do not change normal provider delivery or trigger retries", async () => {
  let calls = 0;
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => {
    calls++; return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: image.split(",")[1] } }] } }] });
  } });
  const result = await provider.generate(input, undefined, { update: () => {}, captureImageParts: () => { throw Error("private write failure"); } });
  assert.equal(result.image, image);
  assert.equal(calls, 1);
});

test("private capture structural fields cannot carry arbitrary provider text", async () => {
  let retained: import("../src/lib/generation/qaCapture").QaImagePart[] = [];
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => Response.json({ candidates: [{
    finishReason: "opaque-auth-value", content: { parts: [{ inlineData: { mimeType: "image/private-clinical-text", data: "AAAA" } }] },
  }] }) });
  await assert.rejects(provider.generate(input, undefined, { update: () => {}, captureImageParts: parts => { retained = parts; } }));
  assert.equal(retained[0].finishReason, "unknown");
  assert.equal(retained[0].mimeType, "image/unsupported");
  assert.equal(retained[0].omitted, "unsupported_mime");
  assert.equal(JSON.stringify(retained).includes("opaque-auth-value"), false);
  assert.equal(JSON.stringify(retained).includes("private-clinical-text"), false);
});

test("private client capture precedes failed delivery validation and is excluded from saved result metadata", async () => {
  const before = process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE;
  const envelope = { runId, requestId, parts: [{ image }] };
  let captures = 0;
  try {
    process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE = "1";
    await assert.rejects(generateSmileImage({ originalImage: image, settings: input.settings, resolution: "1K" }, {
      requestId, online: () => true, fetcher: async () => Response.json({ code: "provider_no_image", qaCapture: envelope }, { status: 502 }),
      onQaCapture: captured => { assert.deepEqual(captured, envelope); captures++; },
    }));
    assert.equal(captures, 1);
    const result = await generateSmileImage({ originalImage: image, settings: input.settings, resolution: "1K" }, {
      requestId, online: () => true, fetcher: async () => Response.json({ image, mode: "live", variationId: crypto.randomUUID(), qaCapture: envelope }),
      onQaCapture: () => { captures++; },
    });
    assert.equal(captures, 2);
    assert.equal("qaCapture" in result, false);
    process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE = "0";
    const normal = await generateSmileImage({ originalImage: image, settings: input.settings, resolution: "1K" }, {
      requestId, online: () => true, fetcher: async () => Response.json({ image, mode: "live", variationId: crypto.randomUUID(), qaCapture: envelope }),
      onQaCapture: () => { captures++; },
    });
    assert.equal("qaCapture" in normal, false);
    assert.equal(captures, 2);
  } finally { if (before === undefined) delete process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE; else process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE = before; }
});
