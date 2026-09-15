import type { SmileImageProvider } from "./provider";
import type { GenerationInput } from "./schema";
import type { GenerationResult } from "../types";
import { imageSchema } from "./schema";
import { buildSmileInstruction } from "./prompt";
import { GenerationError } from "./errors";
import { imageDimensions } from "./openai";

// Google "Nano Banana" family. Default to the current workhorse; override with
// GEMINI_IMAGE_MODEL. Cheapest: gemini-2.5-flash-image. Premium: gemini-3-pro-image.
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-image";
export const GEMINI_IMAGE_TIMEOUT_MS = 240_000;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiOptions = {
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

// Supported Gemini output aspect ratios, as ratio (width / height).
const ASPECT_RATIOS: ReadonlyArray<[string, number]> = [
  ["21:9", 21 / 9],
  ["16:9", 16 / 9],
  ["3:2", 3 / 2],
  ["4:3", 4 / 3],
  ["5:4", 5 / 4],
  ["1:1", 1],
  ["4:5", 4 / 5],
  ["3:4", 3 / 4],
  ["2:3", 2 / 3],
  ["9:16", 9 / 16],
];

/** Pick the supported aspect ratio closest to the source photo's proportions. */
export function nearestAspectRatio(width: number, height: number): string {
  const target = Math.log(width / height);
  let best = ASPECT_RATIOS[0];
  let bestDelta = Infinity;
  for (const entry of ASPECT_RATIOS) {
    const delta = Math.abs(Math.log(entry[1]) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry;
    }
  }
  return best[0];
}

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

export class GeminiSmileProvider implements SmileImageProvider {
  readonly name = "gemini";
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: GeminiOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    if (!this.options.apiKey.trim())
      throw new GenerationError(
        "Google Gemini isn’t connected yet. Add the app’s Gemini API key to enable smile generation.",
        503,
        "provider_not_configured",
      );
    if (signal?.aborted) throw signal.reason;

    const [prefix, encoded] = input.originalImage.split(",");
    const mime = prefix.includes("image/png") ? "image/png" : "image/jpeg";
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const dimensions = imageDimensions(bytes, mime);
    const model = this.options.model || DEFAULT_GEMINI_MODEL;

    const requestParts: Array<{
      inlineData?: { mimeType: string; data: string };
      text?: string;
    }> = [{ inlineData: { mimeType: mime, data: encoded } }];
    if (input.referenceImage) {
      const [refPrefix, refData] = input.referenceImage.split(",");
      requestParts.push({
        inlineData: {
          mimeType: refPrefix.includes("image/png") ? "image/png" : "image/jpeg",
          data: refData,
        },
      });
    }
    requestParts.push({
      text: buildSmileInstruction(input.settings, Boolean(input.referenceImage)),
    });
    const requestBody = {
      contents: [{ parts: requestParts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: nearestAspectRatio(dimensions.width, dimensions.height),
        },
      },
    };

    const timeout = AbortSignal.timeout(
      this.options.timeoutMs ?? GEMINI_IMAGE_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await this.fetcher(
        `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "x-goog-api-key": this.options.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        },
      );
    } catch (error) {
      // Record only a category, never request bodies, photos or credentials.
      const reason = error instanceof Error ? error.message : "";
      console.error("Gemini transport failure", {
        category: /illegal invocation|this reference/i.test(reason) ? "runtime_binding"
          : /cache.*not implemented/i.test(reason) ? "runtime_cache_option"
          : timeout.aborted ? "timeout" : signal?.aborted ? "cancelled" : "network",
      });
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted)
        throw new GenerationError(
          "This preview took too long. Please try again with a smaller photo.",
          504,
          "generation_timeout",
        );
      throw new GenerationError(
        "Google Gemini couldn’t be reached. Your photo and selections are safe — please try again.",
        502,
        "provider_unavailable",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        typeof body?.error?.message === "string" ? body.error.message : "";
      const status = typeof body?.error?.status === "string" ? body.error.status : "";
      if (response.status === 400 && /api key/i.test(message))
        throw new GenerationError(
          "The Gemini API key wasn’t accepted. Update the app’s server key to reconnect.",
          503,
          "invalid_api_key",
        );
      if (response.status === 400)
        throw new GenerationError(
          "Google Gemini couldn’t create this preview. Your original photo is unchanged — please try again.",
          400,
          "generation_failed",
        );
      if (response.status === 401 || response.status === 403)
        throw new GenerationError(
          "This Gemini key doesn’t have access to the image model. Check the key and that the model is enabled for the project.",
          503,
          "model_access_required",
        );
      if (response.status === 404)
        throw new GenerationError(
          "The configured Gemini image model wasn’t found. Check GEMINI_IMAGE_MODEL.",
          503,
          "model_access_required",
        );
      if (response.status === 429 || status === "RESOURCE_EXHAUSTED")
        throw new GenerationError(
          "Gemini quota is exhausted or too many requests were sent. Check the project’s billing/quota, then try again.",
          429,
          "rate_limited",
        );
      throw new GenerationError(
        "Google Gemini couldn’t create this preview. Your original photo is unchanged — please try again.",
      );
    }

    const body = await response.json().catch(() => null);
    const parts: GeminiPart[] = body?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => typeof p?.inlineData?.data === "string");
    const data = imagePart?.inlineData?.data ?? "";
    const outMime =
      imagePart?.inlineData?.mimeType === "image/jpeg"
        ? "image/jpeg"
        : "image/png";
    const image = data ? `data:${outMime};base64,${data}` : "";

    if (!image) {
      // Model returned no image (e.g. a safety refusal returns text only).
      throw new GenerationError(
        "Gemini couldn’t process this photograph. Please choose a different, clear smiling photo.",
        422,
        "image_not_processed",
      );
    }
    if (!imageSchema.safeParse(image).success)
      throw new GenerationError(
        "Gemini returned a preview that couldn’t be opened. Please try again.",
        502,
        "invalid_provider_image",
      );
    return { image, mode: "live", variationId: crypto.randomUUID() };
  }
}
