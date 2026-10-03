import test from "node:test";
import assert from "node:assert/strict";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import { contractExamples } from "./fixtures/generation-contract-examples";
import { readFileSync } from "node:fs";
import { upperTeeth } from "../src/lib/types";
import { AI_CONSENT_VERSION } from "../src/lib/aiConsent";
import type { AccountServices } from "../src/server/access";
const image = `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`;

for (const name of ["Single tooth", "Alignment", "Full Arch preserve gingiva", "Full Arch include prosthetic gingiva"]) {
  test(`server rejects hidden ${name} before request claim or provider use`, async () => {
    let claims = 0;
    const response = await handleGenerationRequest(new Request("https://staging.test/api/generate-smile", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID() },
      body: JSON.stringify({ originalImage: image, settings: contractExamples[name], resolution: "1K", internal: true }),
    }), { SMILE_PROVIDER: "mock" }, async () => { claims++; return true; });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "mode_unavailable");
    assert.equal(claims, 0);
  });
}

for (const teeth of [4, 6, 8, 10] as const) {
  test(`server allows supported ${teeth}-tooth Composite through the gate`, async () => {
    const settings = { ...contractExamples.Composite, teeth, selectedTeeth: upperTeeth[teeth] };
    const response = await handleGenerationRequest(new Request("https://staging.test/api/generate-smile", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalImage: image, settings, resolution: "1K" }),
    }), { SMILE_PROVIDER: "mock" });
    assert.equal(response.status, 200);
  });
}

test("internal server flag permits the mode but does not bypass real-provider authentication", async () => {
  const response = await handleGenerationRequest(new Request("https://staging.test/api/generate-smile", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID(), "X-Smile-AI-Consent": AI_CONSENT_VERSION },
    body: JSON.stringify({ originalImage: image, settings: contractExamples["Single tooth"], resolution: "1K" }),
  }), { SMILE_PROVIDER: "gemini", GEMINI_API_KEY: "synthetic-test-key", SMILE_GEMINI_DATA_TERMS: "paid", SMILE_INTERNAL_SINGLE_TOOTH: "1" }, async () => true,
  { store: { verifyAccessToken: async () => null } } as unknown as AccountServices);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "auth_required");
});
