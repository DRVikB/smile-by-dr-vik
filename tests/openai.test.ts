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
      assert.equal(init?.cache, "no-store");
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
        "Composite",
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
      headers: { "Content-Type": "application/json" },
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
  assert.equal(getSmileProvider({}).name, "mock");
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
