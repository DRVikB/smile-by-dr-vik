import { test } from "node:test";
import assert from "node:assert/strict";
import { completeCost, emptyCaseCosts, geminiCostReceipt, imageOutputCost, PRICED_GEMINI_MODEL, validCaseCosts } from "../src/lib/generation/cost";
import { generationPricing, handlePricingRequest } from "../src/lib/generation/pricing";
import { generationSchema } from "../src/lib/generation/schema";
import { defaultSettings } from "../src/lib/types";

test("standard and draft estimates use the published image token tariff, multiplied for all three options", () => {
  assert.equal(imageOutputCost("1K"), 0.0672);
  assert.equal(imageOutputCost("512"), 0.04482);
  assert.ok(Math.abs(imageOutputCost("1K") * 3 - 0.2016) < 1e-12);
});

test("pricing is a public allowlist, never serialises deployment secrets and does not price unknown providers", async () => {
  const env = { SMILE_PROVIDER: "gemini", SMILE_GEMINI_API_KEY: "private-secret" };
  const response = handlePricingRequest(env);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.ok(!text.includes("private-secret"));
  assert.ok(!text.includes("API_KEY"));
  assert.equal(JSON.parse(text).supportsDraft, true);
  assert.equal(generationPricing({ ...env, GEMINI_IMAGE_MODEL: "future-model" }).outputUsd, null);
  assert.equal(generationPricing({ SMILE_PROVIDER: "openai" }).outputUsd, null);
  assert.equal(generationPricing({ SMILE_PROVIDER: "mock" }).outputUsd?.["1K"], 0);
});

test("usage-based receipts include patient/reference input, output images, text and thinking separately", () => {
  const cost = geminiCostReceipt(PRICED_GEMINI_MODEL, "1K", {
    promptTokenCount: 5000, thoughtsTokenCount: 1500,
    candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }, { modality: "TEXT", tokenCount: 100 }],
  });
  assert.equal(cost?.basis, "usage");
  assert.ok(Math.abs(cost!.usd - 0.0745) < 1e-12);
});

test("missing, invalid or incomplete usage is explicitly image-only, unknown models remain unpriced", () => {
  for (const usage of [undefined, {}, { promptTokenCount: -1 }, { promptTokenCount: 10, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 3 }] }]) {
    assert.equal(geminiCostReceipt(PRICED_GEMINI_MODEL, "512", usage)?.basis, "image-only");
    assert.equal(geminiCostReceipt(PRICED_GEMINI_MODEL, "512", usage)?.usd, 0.04482);
  }
  assert.equal(geminiCostReceipt("another-model", "1K", {}), undefined);
});

test("case totals retain unresolved requests and count incomplete responses without pretending they cost zero", () => {
  const requested = { ...emptyCaseCosts(), requested: 3 };
  const first = completeCost(requested, geminiCostReceipt(PRICED_GEMINI_MODEL, "1K", {}));
  const second = completeCost(first);
  assert.equal(second.requested - second.completed, 1);
  assert.equal(second.imageOnly, 1);
  assert.equal(second.unpriced, 1);
  assert.equal(second.estimatedUsd, 0.0672);
  assert.equal(validCaseCosts(second), true);
  assert.equal(validCaseCosts({ ...second, completed: 4 }), false);
  assert.equal(validCaseCosts({ ...second, estimatedUsd: NaN }), false);
});

test("only the supported economical resolutions are accepted by the API schema", () => {
  const input = { originalImage: "data:image/png;base64,iVBORw0KGgo=", settings: defaultSettings };
  assert.equal(generationSchema.safeParse(input).success, true);
  assert.equal(generationSchema.safeParse({ ...input, resolution: "512" }).success, true);
  assert.equal(generationSchema.safeParse({ ...input, resolution: "4K" }).success, false);
});
