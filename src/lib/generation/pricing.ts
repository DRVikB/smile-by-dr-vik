import { readProviderEnvironment, type ProviderEnvironment } from "./provider";
import { DEFAULT_GEMINI_MODEL } from "./gemini";
import { imageOutputCost, PRICED_GEMINI_MODEL, PRICING_DATE, type GenerationPricing } from "./cost";

/** Return only public price information. Never serialise the environment. */
export function generationPricing(env: ProviderEnvironment = readProviderEnvironment()): GenerationPricing {
  const provider = env.SMILE_PROVIDER || ((env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY) ? "gemini" : env.OPENAI_API_KEY ? "openai" : "unconfigured");
  const model = provider === "gemini" ? env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_MODEL : provider;
  const priced = provider === "gemini" && model === PRICED_GEMINI_MODEL;
  return { model, free: provider === "mock", supportsDraft: priced,
    outputUsd: provider === "mock" ? { "512": 0, "1K": 0 } : priced ? { "512": imageOutputCost("512"), "1K": imageOutputCost("1K") } : null,
    checkedAt: PRICING_DATE };
}
export function handlePricingRequest(env?: ProviderEnvironment) {
  return Response.json(generationPricing(env), { headers: { "Cache-Control": "no-store" } });
}
