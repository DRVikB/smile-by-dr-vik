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
const bytes = readFileSync("public/sample-smile.jpg");
const encoded = bytes.toString("base64");
const input = {
  originalImage: `data:image/jpeg;base64,${encoded}`,
  settings: defaultSettings,
};
const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

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
      assert.equal(form.get("output_format"), "jpeg");
      assert.equal(form.get("quality"), "high");
      assert.equal(form.has("input_fidelity"), false);
      const file = form.get("image[]") as File;
      assert.equal(file.type, "image/jpeg");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
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
  assert.equal(result.image, input.originalImage);
  assert.equal(calls, 1);
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
    assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), bytes);
    assert.deepEqual(Buffer.from(await images[1].arrayBuffer()), pngBytes);
    for (const image of images.slice(2)) assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
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
