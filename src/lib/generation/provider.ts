import { OpenAISmileProvider } from "./openai";
import { GeminiSmileProvider } from "./gemini";
import { GenerationError } from "./errors";
import type { GenerationResult } from "../types";
import { generationSchema, imageSchema, type GenerationInput } from "./schema";
import { buildSmileInstruction } from "./prompt";
export interface SmileImageProvider {
  readonly name: string;
  generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}
/** Honest no-op simulation: never invent an anatomical edit to a patient photo. */
export class MockSmileProvider implements SmileImageProvider {
  readonly name = "mock";
  async generate(input: GenerationInput): Promise<GenerationResult> {
    return {
      image: input.originalImage,
      mode: "mock",
      variationId: crypto.randomUUID(),
    };
  }
}
/** Optional server-only adapter contract. The endpoint returns { image: dataUrl }. */
export class HttpSmileProvider implements SmileImageProvider {
  readonly name = "http";
  constructor(
    private endpoint: string,
    private apiKey: string,
  ) {}
  async generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    if (new URL(this.endpoint).protocol !== "https:")
      throw new Error("Provider endpoint requires HTTPS.");
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...input,
        instruction: buildSmileInstruction(input.settings),
        variationId: crypto.randomUUID(),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Image provider could not complete the request.");
    const result = await response.json();
    const image = imageSchema.parse(result.image);
    return { image, mode: "live", variationId: crypto.randomUUID() };
  }
}
export interface ProviderEnvironment {
  GEMINI_API_KEY?: string;
  GEMINI_IMAGE_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  SMILE_PROVIDER?: string;
  SMILE_PROVIDER_URL?: string;
  SMILE_PROVIDER_API_KEY?: string;
}
export function getSmileProvider(
  env: ProviderEnvironment = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    SMILE_PROVIDER: process.env.SMILE_PROVIDER,
    SMILE_PROVIDER_URL: process.env.SMILE_PROVIDER_URL,
    SMILE_PROVIDER_API_KEY: process.env.SMILE_PROVIDER_API_KEY,
  },
): SmileImageProvider {
  const mode =
    env.SMILE_PROVIDER ||
    (env.GEMINI_API_KEY ? "gemini" : env.OPENAI_API_KEY ? "openai" : "mock");
  if (mode === "gemini")
    return new GeminiSmileProvider({
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_IMAGE_MODEL,
    });
  if (mode === "openai")
    return new OpenAISmileProvider({
      apiKey: env.OPENAI_API_KEY || "",
      model: env.OPENAI_IMAGE_MODEL,
    });
  if (mode === "mock") return new MockSmileProvider();
  if (mode === "http" && env.SMILE_PROVIDER_URL && env.SMILE_PROVIDER_API_KEY)
    return new HttpSmileProvider(
      env.SMILE_PROVIDER_URL,
      env.SMILE_PROVIDER_API_KEY,
    );
  throw new GenerationError(
    "AI generation isn’t connected. Check the app’s provider configuration.",
    503,
    "provider_not_configured",
  );
}
export async function generateSmile(
  input: unknown,
  signal?: AbortSignal,
  provider = getSmileProvider(),
): Promise<GenerationResult> {
  return provider.generate(generationSchema.parse(input), signal);
}
