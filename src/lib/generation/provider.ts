import { OpenAISmileProvider } from "./openai";
import { GeminiSmileProvider } from "./gemini";
import { GenerationError } from "./errors";
import { parseServiceAccount, vertexTransport } from "./googleTransport";
import type { GenerationResult } from "../types";
import { generationSchema, imageSchema, type GenerationInput } from "./schema";
import { isNoChangeDesign } from "./designPlan";
import { buildSmileInstruction, SMILE_PROMPT_VERSION } from "./prompt";
/**
 * Server-side AI provider contract. The app never calls a provider directly:
 * UI → SmileImageService (client) → /api/generate-smile → getSmileProvider().
 * GeminiSmileProvider is the production implementation.
 */
export interface SmileImageProvider {
  readonly name: string;
  /** Vendor and model recorded in generation metadata. */
  readonly vendor?: string;
  readonly model?: string;
  /** False when required server credentials are missing; checked before any request. */
  readonly configured?: boolean;
  generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}
/** Honest no-op simulation: never invent an anatomical edit to a patient photo. */
export class MockSmileProvider implements SmileImageProvider {
  readonly name = "mock";
  readonly model = "mock";
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
  readonly model = "custom-http";
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
        instruction: buildSmileInstruction(input.settings, Boolean(input.referenceImage), input.framing, input.styleReferences?.length ?? 0, input.sourceBounds),
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
  /** "on" attaches the Tooth Map edit mask to Gemini requests as guidance. Off by default. */
  SMILE_MASK_GUIDANCE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  SMILE_PROVIDER?: string;
  SMILE_PROVIDER_URL?: string;
  SMILE_PROVIDER_API_KEY?: string;
  /** Vertex AI (SMILE_PROVIDER=vertex). */
  VERTEX_PROJECT_ID?: string;
  VERTEX_LOCATION?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /**
   * Owner's confirmation of which Google data terms govern patient processing:
   * "paid" (Gemini Developer API, paid tier, Google Cloud DPA) or "vertex".
   * Live Google generation is refused until this is set deliberately.
   */
  SMILE_GEMINI_DATA_TERMS?: string;
  /** OpenAI adapter: "api" confirms OpenAI API business terms and DPA are in place. Not a V1 processor. */
  SMILE_OPENAI_DATA_TERMS?: string;
  /** Custom HTTP backend: "confirmed" once its processing terms are documented. Not a V1 processor. */
  SMILE_PROVIDER_DATA_TERMS?: string;
}

/**
 * The owner confirmation each live provider needs before patient photos are
 * sent to it (see docs/SUBPROCESSORS.md). Null for the mock provider.
 */
export function providerDataTermsRequirement(provider: SmileImageProvider): { variable: keyof ProviderEnvironment; value: string } | null {
  if (provider.vendor === "google")
    return { variable: "SMILE_GEMINI_DATA_TERMS", value: (provider as { service?: string }).service === "vertex" ? "vertex" : "paid" };
  if (provider.vendor === "openai") return { variable: "SMILE_OPENAI_DATA_TERMS", value: "api" };
  if (provider.name === "http") return { variable: "SMILE_PROVIDER_DATA_TERMS", value: "confirmed" };
  return null;
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
    SMILE_MASK_GUIDANCE: read("SMILE_MASK_GUIDANCE"),
    OPENAI_API_KEY: read("OPENAI_API_KEY"),
    OPENAI_IMAGE_MODEL: read("OPENAI_IMAGE_MODEL"),
    SMILE_PROVIDER: read("SMILE_PROVIDER"),
    SMILE_PROVIDER_URL: read("SMILE_PROVIDER_URL"),
    SMILE_PROVIDER_API_KEY: read("SMILE_PROVIDER_API_KEY"),
    VERTEX_PROJECT_ID: read("VERTEX_PROJECT_ID"),
    VERTEX_LOCATION: read("VERTEX_LOCATION"),
    GOOGLE_SERVICE_ACCOUNT_JSON: read("GOOGLE_SERVICE_ACCOUNT_JSON"),
    SMILE_GEMINI_DATA_TERMS: read("SMILE_GEMINI_DATA_TERMS"),
    SMILE_OPENAI_DATA_TERMS: read("SMILE_OPENAI_DATA_TERMS"),
    SMILE_PROVIDER_DATA_TERMS: read("SMILE_PROVIDER_DATA_TERMS"),
  };
}
export function getSmileProvider(
  env: ProviderEnvironment = readProviderEnvironment(),
): SmileImageProvider {
  // Preview and Final generation modes currently share GEMINI_IMAGE_MODEL.
  // To vary the model per mode, pass the request's generationMode here.
  const mode =
    env.SMILE_PROVIDER ||
    ((env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY) ? "gemini" : env.OPENAI_API_KEY ? "openai" : "unconfigured");
  if (mode === "gemini")
    return new GeminiSmileProvider({
      apiKey: (env.SMILE_GEMINI_API_KEY || env.GEMINI_API_KEY || "").trim(),
      model: env.GEMINI_IMAGE_MODEL,
      maskGuidance: env.SMILE_MASK_GUIDANCE === "on",
    });
  if (mode === "vertex")
    return new GeminiSmileProvider({
      apiKey: "",
      model: env.GEMINI_IMAGE_MODEL,
      maskGuidance: env.SMILE_MASK_GUIDANCE === "on",
      transport: vertexTransport({
        projectId: env.VERTEX_PROJECT_ID ?? "",
        location: env.VERTEX_LOCATION ?? "global",
        account: parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      }),
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
  // Shown to clinicians: no provider or setting names here (the server log and ENVIRONMENTS.md say how to connect it).
  throw new GenerationError(
    "Smile generation isn’t available right now. Please try again later, or explore a sample case in the meantime.",
    503,
    "provider_not_configured",
  );
}
export async function generateSmile(
  input: unknown,
  signal?: AbortSignal,
  provider = getSmileProvider(),
): Promise<GenerationResult> {
  const parsed = generationSchema.parse(input);
  if (isNoChangeDesign(parsed.settings)) throw new GenerationError("This selection makes no change. Select teeth to edit and choose a different shade or design goal.", 400, "generation_failed");
  const result = await provider.generate(parsed, signal);
  return {
    ...result,
    generation: {
      provider: provider.vendor ?? provider.name,
      model: provider.model ?? provider.name,
      promptVersion: SMILE_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      mode: parsed.generationMode,
    },
  };
}
