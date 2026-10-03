import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contractExamples } from "./fixtures/generation-contract-examples";
import { buildImageEditPrompt } from "../src/lib/generation/imageEditPrompt";
// Exercise preserved internal modes as well as the public V1 contract.
process.env.NEXT_PUBLIC_SMILE_INTERNAL_SINGLE_TOOTH = "1";
process.env.NEXT_PUBLIC_SMILE_INTERNAL_ALIGNMENT = "1";
process.env.NEXT_PUBLIC_SMILE_INTERNAL_FULL_ARCH = "1";

import { generateSmile } from "../src/lib/generation/provider";
import { GeminiSmileProvider } from "../src/lib/generation/gemini";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=";
for (const [name, settings] of Object.entries(contractExamples)) {
  test(`${name}: exact contract snapshot and real client → provider request agree`, async () => {
    const { generateSmileImage } = await import("../src/services/ai/smileImageService");
    const snapshots = JSON.parse(readFileSync(new URL("./fixtures/generation-contract-prompts.json", import.meta.url), "utf8"));
    assert.equal(buildImageEditPrompt(settings), snapshots[name]);
    let calls = 0;
    const provider = new GeminiSmileProvider({ apiKey: "synthetic-test-key", fetcher: async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts.at(-1).text, snapshots[name]);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] });
    } });
    const result = await generateSmileImage({ originalImage: `data:image/png;base64,${png}`, settings, resolution: "1K" }, {
      online: () => true,
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.settings, JSON.parse(JSON.stringify(settings)), "UI state survives the client request unchanged");
        return Response.json(await generateSmile(body, undefined, provider));
      },
    });
    assert.equal(result.image, `data:image/png;base64,${png}`);
    assert.equal(calls, 1);
  });
}
