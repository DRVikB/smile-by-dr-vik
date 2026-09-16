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
  SMILE_GEMINI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_IMAGE_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  SMILE_PROVIDER?: string;
  SMILE_PROVIDER_URL?: string;
  SMILE_PROVIDER_API_KEY?: string;
}
/** Read deployment secrets at request time, outside Netlify's automatic AI key names. */
export function readProviderEnvironment(): ProviderEnvironment {
  const netlify = (globalThis as typeof globalThis & {
    Netlify?: { env: { get(name: string): string | undefined } };
  }).Netlify;
  const read = (key: string) => netlify ? netlify.env.get(key) : process.env[key];
  const hostedOnNetlify = Boolean(netlify || process.env.NETLIFY);
  return {
    SMILE_GEMINI_API_KEY: read("SMILE_GEMINI_API_KEY"),
    // Standard provider names may be populated with a Netlify gateway credential.
    // Our adapter calls Google directly, so Netlify must use the explicit app key.
    GEMINI_API_KEY: hostedOnNetlify ? undefined : read("GEMINI_API_KEY"),
    GEMINI_IMAGE_MODEL: read("GEMINI_IMAGE_MODEL"),
    OPENAI_API_KEY: read("OPENAI_API_KEY"),
    OPENAI_IMAGE_MODEL: read("OPENAI_IMAGE_MODEL"),
    SMILE_PROVIDER: read("SMILE_PROVIDER"),
    SMILE_PROVIDER_URL: read("SMILE_PROVIDER_URL"),
    SMILE_PROVIDER_API_KEY: read("SMILE_PROVIDER_API_KEY"),
  };
}
export function getSmileProvider(
  env: ProviderEnvironment = readProviderEnvironment(),
): SmileImageProvider {
  const mode =
    env.SMILE_PROVIDER ||
    ((env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY) ? "gemini" : env.OPENAI_API_KEY ? "openai" : "unconfigured");
  if (mode === "gemini")
    return new GeminiSmileProvider({
      apiKey: (env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY || "").trim(),
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
    "AI generation isn’t connected. Set SMILE_PROVIDER=gemini and SMILE_GEMINI_API_KEY on the server (GEMINI_API_KEY works for local development only), or use Open test mode to explore the app.",
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
