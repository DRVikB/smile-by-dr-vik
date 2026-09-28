import { readProviderEnvironment, type ProviderEnvironment } from "./provider";
import { DEFAULT_GEMINI_MODEL } from "./gemini";
import { DEFAULT_IMAGE_MODEL } from "./openai";
import { imageOutputCost, PRICED_GEMINI_MODEL, PRICING_DATE, type GenerationPricing } from "./cost";

/** Return only public price information. Never serialise the environment. */
export function generationPricing(env: ProviderEnvironment = readProviderEnvironment()): GenerationPricing {
  const provider = env.SMILE_PROVIDER || ((env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY) ? "gemini" : env.OPENAI_API_KEY ? "openai" : "unconfigured");
  const google = provider === "gemini" || provider === "vertex";
  const model = google ? env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_MODEL
    : provider === "openai" ? env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL : provider;
  const priced = google && model === PRICED_GEMINI_MODEL;
  return { model, free: provider === "mock", supportsDraft: priced,
    outputUsd: provider === "mock" ? { "512": 0, "1K": 0 } : priced ? { "512": imageOutputCost("512"), "1K": imageOutputCost("1K") } : null,
    checkedAt: PRICING_DATE };
}
export function handlePricingRequest(env?: ProviderEnvironment) {
  return Response.json(generationPricing(env), { headers: { "Cache-Control": "no-store" } });
}
