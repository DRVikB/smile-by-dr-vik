import { MAX_STYLE_REFERENCE_LIMIT } from "@/lib/styleMatching";
import type { SmileImageProvider } from "./provider";
import type { GenerationInput } from "./schema";
import type { GenerationResult } from "../types";
import { imageSchema } from "./schema";
import { buildSmileInstruction } from "./prompt";
import { GenerationError } from "./errors";
import { imageDimensions } from "./openai";
import { geminiCostReceipt, PRICED_GEMINI_MODEL } from "./cost";
import { nearestAspectRatio } from "../generationCanvas";
import { developerTransport, type GoogleTransport } from "./googleTransport";
import { safeLog } from "@/server/redact";
export { nearestAspectRatio } from "../generationCanvas";

// Google "Nano Banana" family. Keep the existing model unless GEMINI_IMAGE_MODEL
// is explicitly configured; unknown models are not assigned a guessed tariff.
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-image";
export const GEMINI_IMAGE_TIMEOUT_MS = 240_000;

type GeminiOptions = {
  apiKey: string;
  /** Vertex AI or the Developer API; defaults to the Developer API with apiKey. */
  transport?: GoogleTransport;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Attach the Tooth Map edit mask as guidance (SMILE_MASK_GUIDANCE=on). The device's compositing protects either way. */
  maskGuidance?: boolean;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

export class GeminiSmileProvider implements SmileImageProvider {
  readonly name = "gemini";
  readonly vendor = "google";
  private readonly fetcher: typeof fetch;
  get model() { return this.options.model || DEFAULT_GEMINI_MODEL; }
  get configured() { return this.transport.configured; }
  /** "developer" (Gemini Developer API) or "vertex" (Google Cloud Vertex AI). */
  get service() { return this.transport.kind; }
  private readonly transport: GoogleTransport;
  constructor(private readonly options: GeminiOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.transport = options.transport ?? developerTransport(options.apiKey);
  }

  async generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    if (!this.transport.configured)
      throw new GenerationError(
        "Smile generation isn’t available right now. Please try again later, or explore a sample case in the meantime.",
        503,
        "provider_not_configured",
      );
    if (signal?.aborted) throw signal.reason;

    const [prefix, encoded] = input.originalImage.split(",");
    const mime = prefix.includes("image/png") ? "image/png" : "image/jpeg";
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const dimensions = imageDimensions(bytes, mime);
    const model = this.options.model || DEFAULT_GEMINI_MODEL;
    const resolution = input.resolution ?? "1K";
    if (resolution === "512" && model !== PRICED_GEMINI_MODEL)
      throw new GenerationError("Draft resolution is not available for this model. Choose Standard.", 400, "generation_failed");

    const requestParts: Array<{
      inlineData?: { mimeType: string; data: string };
      text?: string;
    }> = [{ inlineData: { mimeType: mime, data: encoded } }];
    if (input.referenceImage) {
      const [refPrefix, refData] = input.referenceImage.split(",");
      imageDimensions(Uint8Array.from(atob(refData), c => c.charCodeAt(0)), refPrefix.includes("image/png") ? "image/png" : "image/jpeg");
      requestParts.push({
        inlineData: {
          mimeType: refPrefix.includes("image/png") ? "image/png" : "image/jpeg",
          data: refData,
        },
      });
    }
    // The clinician's own finished cases, so the preview matches their work.
    const styleReferences = (input.styleReferences ?? []).slice(0, MAX_STYLE_REFERENCE_LIMIT);
    for (const reference of styleReferences) {
      const [stylePrefix, styleData] = reference.split(",");
      imageDimensions(Uint8Array.from(atob(styleData), c => c.charCodeAt(0)), stylePrefix.includes("image/png") ? "image/png" : "image/jpeg");
      requestParts.push({
        inlineData: {
          mimeType: stylePrefix.includes("image/png")
            ? "image/png"
            : "image/jpeg",
          data: styleData,
        },
      });
    }
    const withMask = Boolean(this.options.maskGuidance && input.editMask);
    if (withMask) requestParts.push({ inlineData: { mimeType: "image/png", data: input.editMask!.split(",")[1] } });
    requestParts.push({
      text: buildSmileInstruction(
        input.settings,
        Boolean(input.referenceImage),
        input.framing,
        styleReferences.length,
        input.sourceBounds,
        withMask,
      ),
    });
    const requestBody = {
      contents: [{ parts: requestParts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: nearestAspectRatio(dimensions.width, dimensions.height),
          ...(model === PRICED_GEMINI_MODEL ? { imageSize: resolution } : {}),
        },
      },
    };

    const timeout = AbortSignal.timeout(
      this.options.timeoutMs ?? GEMINI_IMAGE_TIMEOUT_MS,
    );
    let response: Response;
    try {
      const authHeaders = await this.transport.headers(this.fetcher);
      response = await this.fetcher(
        this.transport.url(model),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...authHeaders,
          },
          body: JSON.stringify(requestBody),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        },
      );
    } catch (error) {
      // Record only a category, never request bodies, photos or credentials.
      const reason = error instanceof Error ? error.message : "";
      safeLog("error", "gemini_transport_failure", {
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
      const reason = body?.error?.details?.find((detail: { reason?: string }) => typeof detail?.reason === "string")?.reason;
      safeLog("error", "gemini_provider_rejected", {
        status: response.status,
        category: ["API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED"].includes(reason)
          ? reason : "provider_rejected",
      });
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
    return { image, mode: "live", variationId: crypto.randomUUID(),
      cost: geminiCostReceipt(model, resolution, body?.usageMetadata) };
  }
}
