import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSmileProvider, generateSmile } from "../src/lib/generation/provider";
import { buildSunburstPrompt, SUNBURST_PROMPT_VERSION } from "../src/lib/generation/contract";
import { SMILE_PROMPT_VERSION } from "../src/lib/generation/version";
import { contractExamples } from "./fixtures/generation-contract-examples";

// Exercise the deployed configuration through the real factory and adapter;
// replace only the network boundary. No credential or live image service used.
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
const snapshots = JSON.parse(readFileSync(new URL("./fixtures/generation-contract-prompts.json", import.meta.url), "utf8"));
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=";

for (const name of ["Whitening", "Composite", "Porcelain", "Alignment", "Full Arch preserve gingiva", "Full Arch include prosthetic gingiva"]) {
  test(`staging ${name} uses Gemini with the canonical instruction and no mask`, async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts.length, 2, "only the source image and canonical prompt reach Gemini");
      assert.deepEqual(body.contents[0].parts[0], { inlineData: { mimeType: "image/png", data: png } });
      assert.equal(body.contents[0].parts[1].text, snapshots[name]);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
        { thought: true, inlineData: { mimeType: "image/png", data: png } },
        { inlineData: { mimeType: "image/png", data: png } },
      ] } }] });
    };
    try {
      const provider = getSmileProvider({ ...config.env.staging.vars, GEMINI_API_KEY: "synthetic-test-key", OPENAI_API_KEY: "unused-test-key" });
      const result = await generateSmile({
        originalImage: `data:image/png;base64,${png}`,
        // Even a stale client-supplied mask must not become ordinary Gemini guidance.
        editMask: `data:image/png;base64,${png}`,
        settings: contractExamples[name],
      }, undefined, provider);
      assert.equal(result.image, `data:image/png;base64,${png}`);
      assert.equal(result.generation?.provider, "google");
      assert.equal(result.generation?.promptVersion, SMILE_PROMPT_VERSION);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
}

test("Sunburst stays available as an explicit alternative with its masked edit and own instruction", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/images/edits");
    const form = init?.body as FormData;
    assert.equal(form.get("model"), "gpt-image-2.5-sunburst");
    assert.ok(form.get("mask"), "the protected edit area travels with every request");
    assert.equal(form.get("prompt"), buildSunburstPrompt(contractExamples.Porcelain));
    return Response.json({ data: [{ b64_json: png }] });
  };
  try {
    const provider = getSmileProvider({ ...config.env.staging.vars, SMILE_PROVIDER: "openai", OPENAI_API_KEY: "synthetic-test-key" });
    const result = await generateSmile({ originalImage: `data:image/png;base64,${png}`, editMask: `data:image/png;base64,${png}`, settings: contractExamples.Porcelain }, undefined, provider);
    assert.equal(result.generation?.provider, "openai");
    assert.equal(result.generation?.promptVersion, SUNBURST_PROMPT_VERSION);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
