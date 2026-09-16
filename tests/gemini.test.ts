import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GeminiSmileProvider,
  DEFAULT_GEMINI_MODEL,
  nearestAspectRatio,
} from "../src/lib/generation/gemini";
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
// Minimal valid 1x1 PNG (base64) so the returned data URL passes imageSchema.
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("Gemini adapter sends one authenticated generateContent edit with all dental choices", async () => {
  let calls = 0;
  const provider = new GeminiSmileProvider({
    apiKey: "test-key",
    fetcher: async (url, init) => {
      calls++;
      assert.equal(
        url,
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
      );
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-goog-api-key"), "test-key");
      assert.equal(headers.get("Content-Type"), "application/json");
      assert.equal(init?.cache, undefined);
      assert.equal(new Headers(init?.headers).get("Cache-Control"), "no-store");
      const body = JSON.parse(String(init?.body));
      const parts = body.contents[0].parts;
      assert.equal(parts[0].inlineData.mimeType, "image/jpeg");
      assert.equal(parts[0].inlineData.data, encoded);
      assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
      assert.ok(typeof body.generationConfig.imageConfig.aspectRatio === "string");
      const prompt = String(parts[1].text);
      for (const token of [
        "Composite",
        "Gently whiten",
        "Rounded",
        "35/100",
        "14, 13, 12, 11, 21, 22, 23, 24",
        "untreated teeth",
      ])
        assert.ok(prompt.includes(token));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  const result = await provider.generate(input);
  assert.equal(result.mode, "live");
  assert.ok(result.image.startsWith("data:image/png;base64,"));
  assert.equal(calls, 1);
});

test("chosen model is used in the request path", async () => {
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    model: "gemini-3-pro-image",
    fetcher: async (url) => {
      assert.ok(String(url).includes("gemini-3-pro-image:generateContent"));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  await provider.generate(input);
});

test("a reference image is sent as an extra part and noted in the prompt", async () => {
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const parts = body.contents[0].parts;
      assert.equal(parts.length, 3);
      assert.equal(parts[0].inlineData.mimeType, "image/jpeg");
      assert.equal(parts[1].inlineData.mimeType, "image/png");
      const text = String(parts[2].text);
      assert.ok(text.includes("the first image is the patient to edit"));
      assert.ok(text.includes("smile the patient likes"));
      assert.ok(!text.includes("finished case"));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  await provider.generate({ ...input, referenceImage: "data:image/png;base64," + PNG_1x1 });
});

test("a capture framing region is passed through to the model", async () => {
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const parts = body.contents[0].parts;
      const text = String(parts[parts.length - 1].text);
      assert.ok(text.includes("on-screen guide"));
      assert.ok(text.includes("30%"));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  await provider.generate({
    ...input,
    framing: { x: 0.3, y: 0.56, width: 0.4, height: 0.16 },
  });
});

test("nearestAspectRatio keeps portrait, square and landscape framing", () => {
  assert.equal(nearestAspectRatio(1000, 1000), "1:1");
  assert.equal(nearestAspectRatio(1600, 900), "16:9");
  assert.equal(nearestAspectRatio(900, 1600), "9:16");
  assert.equal(nearestAspectRatio(1200, 1500), "4:5");
});

test("missing API key has an explicit setup error and never makes a request", async () => {
  const provider = new GeminiSmileProvider({
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
    { SMILE_PROVIDER: "gemini" },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "provider_not_configured");
});

test("a Gemini key is selected automatically and takes precedence; mock stays overridable", () => {
  assert.equal(getSmileProvider({ GEMINI_API_KEY: "test" }).name, "gemini");
  assert.equal(
    getSmileProvider({ GEMINI_API_KEY: "test", OPENAI_API_KEY: "x" }).name,
    "gemini",
  );
  assert.equal(getSmileProvider({ OPENAI_API_KEY: "x" }).name, "openai");
  assert.equal(
    getSmileProvider({ GEMINI_API_KEY: "test", SMILE_PROVIDER: "mock" }).name,
    "mock",
  );
});

test("auth, access, rate limits and malformed output are safe recoverable errors without retries", async () => {
  for (const [status, body, expected] of [
    [400, { error: { message: "API key not valid DO_NOT_EXPOSE" } }, "invalid_api_key"],
    [403, {}, "model_access_required"],
    [404, {}, "model_access_required"],
    [429, { error: { status: "RESOURCE_EXHAUSTED", message: "DO_NOT_EXPOSE" } }, "rate_limited"],
    [200, { candidates: [{ content: { parts: [{ text: "refused" }] } }] }, "image_not_processed"],
    [200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "garbage" } }] } }] }, "invalid_provider_image"],
  ] as const) {
    let calls = 0;
    const provider = new GeminiSmileProvider({
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
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    fetcher: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(provider.generate(input, controller.signal));
  assert.equal(calls, 0);
});

test("default Gemini fetch preserves the Workers global receiver and avoids unsupported cache options", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async function (this: unknown, _url, init) {
    assert.equal(this, globalThis);
    assert.equal(init?.cache, undefined);
    assert.equal(new Headers(init?.headers).get("Cache-Control"), "no-store");
    called = true;
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } }] });
  };
  try {
    const result = await new GeminiSmileProvider({ apiKey: "test-key" }).generate(input);
    assert.equal(result.mode, "live");
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the clinician's own cases are sent as extra parts after the patient's reference", async () => {
  const style = "data:image/jpeg;base64,/9j/" + "A".repeat(40);
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    fetcher: async (_url, init) => {
      const parts = JSON.parse(String(init?.body)).contents[0].parts;
      // patient, patient reference, 3 style references, instruction
      assert.equal(parts.length, 6);
      assert.equal(parts[1].inlineData.mimeType, "image/png");
      for (const i of [2, 3, 4])
        assert.equal(parts[i].inlineData.mimeType, "image/jpeg");
      const text = String(parts[5].text);
      assert.ok(text.includes("following 3 images are finished cases"));
      assert.ok(text.includes("Edit only the first image"));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  await provider.generate({
    ...input,
    referenceImage: "data:image/png;base64," + PNG_1x1,
    styleReferences: [style, style, style],
  });
});

test("a fourth style reference is never forwarded, even if one reaches the provider", async () => {
  const style = "data:image/jpeg;base64,/9j/" + "A".repeat(40);
  const provider = new GeminiSmileProvider({
    apiKey: "test",
    fetcher: async (_url, init) => {
      const parts = JSON.parse(String(init?.body)).contents[0].parts;
      assert.equal(parts.length, 5); // patient + 3 styles + instruction
      assert.ok(String(parts[4].text).includes("next 3 images are finished cases"));
      return Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } },
        ],
      });
    },
  });
  await provider.generate({ ...input, styleReferences: [style, style, style, style] });
});
