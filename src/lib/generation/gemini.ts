import { MAX_STYLE_REFERENCE_LIMIT } from "@/lib/styleMatching";
import type { SmileImageProvider } from "./provider";
import type { GenerationInput } from "./schema";
import type { GenerationResult } from "../types";
import { imageSchema } from "./schema";
import { buildImageEditPrompt } from "./imageEditPrompt";
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
  /** Interim reasoning images are never a patient-facing result. */
  thought?: boolean;
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
      text: buildImageEditPrompt(
        input.settings,
        Boolean(input.referenceImage),
        input.framing,
        styleReferences.length,
        input.sourceBounds,
        withMask,
      ),
    });
    const requestBody = {
      contents: [{ role: "user", parts: requestParts }],
      generationConfig: {
        // Use the documented multimodal edit format. IMAGE-only can suppress
        // an explanation and leave a NO_IMAGE candidate with no content.
        // Text is diagnostic only; only a completed image becomes a preview.
        responseModalities: ["TEXT", "IMAGE"],
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { includeThoughts: false } } : {}),
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
    const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
    const completed = candidates.filter((candidate: { finishReason?: string }) =>
      candidate && (!candidate.finishReason || candidate.finishReason === "STOP"));
    const parts: GeminiPart[] = completed.flatMap((candidate: { content?: { parts?: GeminiPart[] } }) =>
      Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []);
    // Gemini can return draft/thought images before the completed edit. Never
    // present those (or fall back to one when the final image is missing).
    const imagePart = parts.filter((p) => p?.thought !== true &&
      typeof p?.inlineData?.data === "string" &&
      ["image/png", "image/jpeg"].includes(p.inlineData.mimeType ?? "")).at(-1);
    const data = imagePart?.inlineData?.data ?? "";
    const outMime =
      imagePart?.inlineData?.mimeType === "image/jpeg"
        ? "image/jpeg"
        : "image/png";
    const image = data ? `data:${outMime};base64,${data}` : "";

    if (!image) {
      // Empty/text-only output is not proof that the photo was unsuitable.
      // Keep raw provider text, images and signatures out of diagnostics.
      const reasons = candidates.map((candidate: { finishReason?: string }) => candidate?.finishReason);
      const blocked = Boolean(body?.promptFeedback?.blockReason) || reasons.some((reason: string) =>
        ["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION", "IMAGE_RECITATION"].includes(reason));
      safeLog("warn", "gemini_no_final_image", {
        category: blocked ? "blocked" : reasons.includes("MAX_TOKENS") ? "incomplete" : "no_final_image",
        candidates: candidates.length,
        thoughtImages: parts.filter(p => p?.thought === true && Boolean(p.inlineData?.data)).length,
        // Only documented enum values and structural counts, never provider
        // text or patient content. These distinguish refusal from parsing loss.
        finish: reasons.map((reason: unknown) => typeof reason === "string" &&
          ["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "IMAGE_OTHER", "NO_IMAGE"].includes(reason) ? reason : "unknown").join(","),
        textParts: parts.filter(p => typeof p?.text === "string").length,
        imageParts: parts.filter(p => Boolean(p?.inlineData?.data)).length,
        aspect: nearestAspectRatio(dimensions.width, dimensions.height),
        resolution,
        explanation: classifyNoImageExplanation(parts),
        referenceImages: styleReferences.length + (input.referenceImage ? 1 : 0),
        maskGuidance: withMask,
        hasNotes: Boolean(input.settings.notes.trim()),
      });
      throw new GenerationError(
        blocked ? "Google declined this image request. Your original photograph is unchanged."
          : "Google returned no finished preview. Your photo and selections are safe — please try again.",
        blocked ? 422 : 502,
        blocked ? "image_not_processed" : "provider_no_image",
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

/** Bounded categories only: provider text may contain clinical/patient details. */
function classifyNoImageExplanation(parts: GeminiPart[]): string {
  const text = parts.filter(p => p?.thought !== true && typeof p?.text === "string").map(p => p.text).join(" ");
  if (!text) return "none";
  if (/safety|policy|prohibited|not allowed|public figure|celebrity/i.test(text)) return "policy";
  if (/exact.*(pixel|dimension)|pixel.*exact|resolution|aspect ratio/i.test(text)) return "dimensions";
  if (/medical advice|diagnos|treatment plan/i.test(text)) return "medical_context";
  if (/cannot|can't|unable|sorry|not able/i.test(text)) return "declined";
  return "other";
}
