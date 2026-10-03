import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OpenAISmileProvider,
  DEFAULT_IMAGE_MODEL,
  imageDimensions,
  outputSize,
} from "../src/lib/generation/openai";
import { getSmileProvider } from "../src/lib/generation/provider";
import { GenerationError } from "../src/lib/generation/errors";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import { defaultSettings } from "../src/lib/types";
import { friendlyGenerationError, GENERATION_MESSAGES } from "../src/services/ai/smileImageService";
const bytes = readFileSync("public/sample-smile.jpg");
const encoded = bytes.toString("base64");
const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const input = {
  originalImage: `data:image/png;base64,${pngBytes.toString("base64")}`,
  editMask: `data:image/png;base64,${pngBytes.toString("base64")}`,
  settings: defaultSettings,
};

test("OpenAI adapter sends a single authenticated image edit with all dental choices", async () => {
  let calls = 0;
  const provider = new OpenAISmileProvider({
    apiKey: "test-key",
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-key",
      );
      assert.equal(init?.cache, undefined);
      assert.equal(new Headers(init?.headers).get("Cache-Control"), "no-store");
      const form = init?.body as FormData;
      assert.equal(form.get("model"), DEFAULT_IMAGE_MODEL);
      assert.equal(form.get("n"), "1");
      assert.equal(form.get("output_format"), "png");
      assert.equal(form.has("output_compression"), false);
      assert.equal(form.get("quality"), "high");
      assert.equal(form.has("input_fidelity"), false);
      const file = form.get("image[]") as File;
      assert.equal(file.type, "image/png");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), pngBytes);
      const prompt = String(form.get("prompt"));
      for (const token of [
        defaultSettings.treatment,
        "Gently whiten",
        "Rounded",
        "35/100",
        "14, 13, 12, 11, 21, 22, 23, 24",
        "untreated teeth",
      ])
        assert.ok(prompt.includes(token));
      return Response.json({ data: [{ b64_json: encoded }] });
    },
  });
  const result = await provider.generate(input);
  assert.equal(result.mode, "live");
  assert.equal(result.image, `data:image/jpeg;base64,${encoded}`);
  assert.equal(calls, 1);
});

test("Sunburst sends a matching alpha PNG mask, decodes PNG output and reads server quality", async () => {
  const png = `data:image/png;base64,${pngBytes.toString("base64")}`;
  let calls = 0;
  const provider = getSmileProvider({ SMILE_PROVIDER: "openai", OPENAI_API_KEY: "test", OPENAI_IMAGE_QUALITY: "medium", GEMINI_API_KEY: "disabled" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const form = init?.body as FormData;
    assert.equal(form.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(form.get("quality"), "medium");
    assert.equal(form.get("output_format"), "png");
    const mask = form.get("mask") as File;
    assert.equal(mask.type, "image/png");
    assert.deepEqual(Buffer.from(await mask.arrayBuffer()), pngBytes);
    return Response.json({ data: [{ b64_json: pngBytes.toString("base64") }] });
  };
  try { assert.equal((await provider.generate({ ...input, originalImage: png, editMask: png })).image, png); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(calls, 1);
});

test("incompatible mask dimensions or source format fail before any paid edit", async () => {
  let calls = 0;
  const provider = new OpenAISmileProvider({ apiKey: "test", fetcher: async () => { calls++; return Response.json({ data: [{ b64_json: encoded }] }); } });
  const png = `data:image/png;base64,${pngBytes.toString("base64")}`;
  const wrong = Buffer.from(pngBytes); wrong.writeUInt32BE(2, 16);
  for (const candidate of [{ ...input, originalImage: `data:image/jpeg;base64,${encoded}`, editMask: png }, { ...input, originalImage: png, editMask: `data:image/png;base64,${wrong.toString("base64")}` }])
    await assert.rejects(provider.generate(candidate), (e: unknown) => e instanceof GenerationError && e.code === "invalid_image");
  assert.equal(calls, 0);
});

test("output resolution meets image API limits and retains portrait, square and landscape framing", () => {
  for (const [w, h] of [
    [1122, 1402],
    [2048, 2048],
    [2000, 900],
    [200, 600],
    [2048, 683],
  ]) {
    const [width, height] = outputSize(w, h).split("x").map(Number);
    assert.equal(width % 16, 0);
    assert.equal(height % 16, 0);
    assert.ok(width * height >= 655360 && width * height <= 8294400);
    assert.ok(Math.max(width, height) <= 3840);
    assert.ok(width / height >= 1 / 3 && width / height <= 3);
    assert.ok(Math.abs(width / height / (w / h) - 1) < 0.03);
  }
  assert.throws(() => outputSize(100, 1000), GenerationError);
  const d = imageDimensions(bytes, "image/jpeg");
  assert.ok(d.width > 200 && d.height > 200);
  assert.throws(
    () => imageDimensions(new Uint8Array([255, 216, 255]), "image/jpeg"),
    GenerationError,
  );
});

test("image headers reject empty, oversized and malformed dimensions before generation", async () => {
  assert.deepEqual(imageDimensions(pngBytes, "image/png"), { width: 1, height: 1 });
  const invalid = [
    [0, 1], [1, 0], [100_001, 1000], [0xffffffff, 0xffffffff],
  ].map(([width, height]) => {
    const edited = Buffer.from(pngBytes);
    edited.writeUInt32BE(width, 16); edited.writeUInt32BE(height, 20);
    return edited;
  });
  const brokenHeader = Buffer.from(pngBytes); brokenHeader.writeUInt32BE(0, 12);
  invalid.push(brokenHeader, pngBytes.subarray(0, 24));
  let calls = 0;
  const provider = new OpenAISmileProvider({ apiKey: "test", fetcher: async () => { calls++; return Response.json({}); } });
  for (const photo of invalid) {
    assert.throws(() => imageDimensions(photo, "image/png"), GenerationError);
    await assert.rejects(provider.generate({ ...input, originalImage: `data:image/png;base64,${photo.toString("base64")}` }), GenerationError);
  }
  // A SOF JPEG with a zero height is also rejected before a paid request.
  assert.throws(() => imageDimensions(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 7, 8, 0, 0, 0, 1]), "image/jpeg"), GenerationError);
  assert.equal(calls, 0);
});

test("OpenAI includes patient reference and bounded own-case images in the stated order", async () => {
  const referenceImage = `data:image/png;base64,${pngBytes.toString("base64")}`;
  let calls = 0;
  const provider = new OpenAISmileProvider({ apiKey: "test", fetcher: async (_url, init) => {
    calls++;
    const form = init?.body as FormData;
    const images = form.getAll("image[]") as File[];
    assert.equal(images.length, 7); // patient, patient reference, 5 own cases (the maximum)
    assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), pngBytes);
    assert.deepEqual(Buffer.from(await images[1].arrayBuffer()), pngBytes);
    for (const image of images.slice(2)) assert.deepEqual(Buffer.from(await image.arrayBuffer()), pngBytes);
    const prompt = String(form.get("prompt"));
    assert.match(prompt, /first image is the SOURCE PATIENT to edit/);
    assert.match(prompt, /next image is a smile the patient likes/);
    assert.match(prompt, /following 5 images are finished cases/);
    assert.match(prompt, /SOURCE CANVAS/);
    assert.equal(form.get("model"), DEFAULT_IMAGE_MODEL);
    assert.equal(form.get("quality"), "high");
    assert.equal(form.get("n"), "1");
    return Response.json({ data: [{ b64_json: encoded }] });
  } });
  await provider.generate({ ...input, referenceImage, styleReferences: Array(6).fill(input.originalImage), sourceBounds: { x: 0.1, y: 0, width: 0.8, height: 1 } });
  assert.equal(calls, 1);
});

test("missing mask or invalid server quality never reaches a paid Sunburst request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ data: [{ b64_json: encoded }] }); };
  await assert.rejects(new OpenAISmileProvider({ apiKey: "test", fetcher }).generate({ ...input, editMask: undefined }), (e: unknown) => e instanceof GenerationError && e.code === "invalid_image");
  await assert.rejects(new OpenAISmileProvider({ apiKey: "test", quality: "invalid", fetcher }).generate(input), (e: unknown) => e instanceof GenerationError && e.code === "provider_not_configured");
  assert.equal(calls, 0);
});

test("provider API credit failure is service unavailability, never a clinician subscription failure", async () => {
  const provider = new OpenAISmileProvider({ apiKey: "test", fetcher: async () => Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }) });
  await assert.rejects(provider.generate(input), (error: unknown) => {
    assert.ok(error instanceof GenerationError);
    assert.equal(friendlyGenerationError(error.status, error.code).message, GENERATION_MESSAGES.unavailable);
    return true;
  });
});

test("missing API key has an explicit setup error and never makes a request", async () => {
  const provider = new OpenAISmileProvider({
    apiKey: "",
    fetcher: async () => {
      throw new Error("Unexpected network call");
    },
  });
  await assert.rejects(
    provider.generate(input),
    (error: unknown) =>
      error instanceof GenerationError &&
      error.status === 503 &&
      error.code === "provider_not_configured",
  );
  const response = await handleGenerationRequest(
    new Request("https://smile.test/api/generate-smile", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
    { SMILE_PROVIDER: "openai" },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "provider_not_configured");
});

test("configured OpenAI is selected automatically and explicit mock remains available", () => {
  assert.equal(getSmileProvider({ OPENAI_API_KEY: "test" }).name, "openai");
  assert.equal(
    getSmileProvider({ OPENAI_API_KEY: "test", SMILE_PROVIDER: "mock" }).name,
    "mock",
  );
  assert.throws(() => getSmileProvider({}), (error: unknown) => error instanceof GenerationError && error.code === "provider_not_configured");
});

test("rate limits, billing, authorization and malformed output are safe recoverable errors without retries", async () => {
  for (const [status, body, expected] of [
    [
      429,
      { error: { code: "rate_limit_exceeded", message: "DO_NOT_EXPOSE" } },
      "rate_limited",
    ],
    [429, { error: { code: "insufficient_quota" } }, "api_credits_required"],
    [401, { error: { message: "DO_NOT_EXPOSE" } }, "invalid_api_key"],
    [403, {}, "model_access_required"],
    [400, { error: { code: "moderation_blocked" } }, "image_not_processed"],
    [200, { data: [] }, "invalid_provider_image"],
    [200, { data: [{ b64_json: "garbage" }] }, "invalid_provider_image"],
  ] as const) {
    let calls = 0;
    const provider = new OpenAISmileProvider({
      apiKey: "test",
      fetcher: async () => {
        calls++;
        return Response.json(body, { status });
      },
    });
    await assert.rejects(
      provider.generate(input),
      (error: unknown) =>
        error instanceof GenerationError &&
        error.code === expected &&
        !error.message.includes("DO_NOT_EXPOSE"),
    );
    assert.equal(calls, 1);
  }
});

test("cancelled generation does not send a paid request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const provider = new OpenAISmileProvider({
    apiKey: "test",
    fetcher: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(provider.generate(input, controller.signal));
  assert.equal(calls, 0);
});
