import type { ProviderTrace } from "./providerDiagnostics";
import { MAX_STYLE_REFERENCE_LIMIT } from "@/lib/styleMatching";
import type { SmileImageProvider } from "./provider";
import type { GenerationInput } from "./schema";
import type { GenerationResult } from "../types";
import { imageSchema } from "./schema";
import { buildSmileInstruction } from "./prompt";
import { GenerationError } from "./errors";

export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const OPENAI_IMAGE_TIMEOUT_MS = 240_000;
const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";

type OpenAIOptions = {
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

/** Read encoded dimensions without a native imaging dependency (Node and Workers). */
export function imageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = (width: number, height: number) => {
    if (!width || !height || width * height > 100_000_000)
      throw new GenerationError("This photo has invalid or oversized dimensions. Please upload another JPG or PNG.", 400, "invalid_image");
    return { width, height };
  };
  if (mime === "image/png" && bytes.length >= 33
    && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a
    && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452)
    return dimensions(view.getUint32(16), view.getUint32(20));
  if (mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      ) {
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
  }
  throw new GenerationError(
    "This photo couldn’t be read. Please upload another JPG or PNG.",
    400,
    "invalid_image",
  );
}

/** Preserve the source aspect ratio using OpenAI's 16-pixel resolution increments. */
export function outputSize(width: number, height: number): string {
  const ratio = width / height;
  if (
    !Number.isFinite(ratio) ||
    width < 1 ||
    height < 1 ||
    ratio < 1 / 3 ||
    ratio > 3
  ) {
    throw new GenerationError(
      "Use a portrait or landscape photograph rather than a panorama.",
      400,
      "unsupported_aspect_ratio",
    );
  }
  const scale = Math.sqrt(1_310_720 / (width * height));
  let outWidth = Math.round((width * scale) / 16) * 16;
  let outHeight = Math.round((height * scale) / 16) * 16;
  if (outWidth > 3 * outHeight) outHeight = Math.ceil(outWidth / 3 / 16) * 16;
  if (outHeight > 3 * outWidth) outWidth = Math.ceil(outHeight / 3 / 16) * 16;
  return `${outWidth}x${outHeight}`;
}

export class OpenAISmileProvider implements SmileImageProvider {
  readonly name = "openai";
  readonly vendor = "openai";
  private readonly fetcher: typeof fetch;
  get model() { return this.options.model || DEFAULT_IMAGE_MODEL; }
  get configured() { return Boolean(this.options.apiKey.trim()); }
  constructor(private readonly options: OpenAIOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async generate(
    input: GenerationInput,
    signal?: AbortSignal,
    trace?: ProviderTrace,
  ): Promise<GenerationResult> {
    if (!this.options.apiKey.trim())
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
    const form = new FormData();
    form.set("model", this.options.model || DEFAULT_IMAGE_MODEL);
    form.set(
      "image[]",
      new Blob([bytes], { type: mime }),
      mime === "image/png" ? "smile.png" : "smile.jpg",
    );
    const styleReferences = (input.styleReferences ?? []).slice(0, MAX_STYLE_REFERENCE_LIMIT);
    const references = [...(input.referenceImage ? [input.referenceImage] : []), ...styleReferences];
    for (const [index, reference] of references.entries()) {
      const [referencePrefix, referenceData] = reference.split(",");
      const referenceMime = referencePrefix.includes("image/png") ? "image/png" : "image/jpeg";
      const referenceBytes = Uint8Array.from(atob(referenceData), c => c.charCodeAt(0));
      imageDimensions(referenceBytes, referenceMime);
      form.append("image[]", new Blob([referenceBytes], { type: referenceMime }), `reference-${index + 1}.${referenceMime === "image/png" ? "png" : "jpg"}`);
    }
    form.set("prompt", buildSmileInstruction(input.settings, Boolean(input.referenceImage), input.framing, styleReferences.length, input.sourceBounds));
    form.set("n", "1");
    form.set("size", outputSize(dimensions.width, dimensions.height));
    form.set("quality", "high");
    form.set("output_format", "jpeg");
    form.set("output_compression", "95");
    const [requestedWidth, requestedHeight] = outputSize(dimensions.width, dimensions.height).split("x").map(Number);
    trace?.update({ requestedWidth, requestedHeight });
    // gpt-image-2 uses high input fidelity automatically and disallows this override.
    const timeout = AbortSignal.timeout(
      this.options.timeoutMs ?? OPENAI_IMAGE_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await this.fetcher(EDIT_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Cache-Control": "no-store" },
        body: form,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      trace?.update({ category: timeout.aborted ? "timeout" : signal?.aborted ? "cancelled" : "transport_error" });
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted)
        throw new GenerationError(
          "This preview took too long. Please try again with a smaller photo.",
          504,
          "generation_timeout",
        );
      throw new GenerationError(
        "OpenAI couldn’t be reached. Your photo and selections are safe — please try again.",
        502,
        "provider_unavailable",
      );
    }
    trace?.update({ httpStatus: response.status });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      trace?.update({ category: "http_error" });
      const code = typeof body?.error?.code === "string" ? body.error.code : "";
      if (
        code === "insufficient_quota" ||
        code === "billing_hard_limit_reached"
      )
        throw new GenerationError(
          "OpenAI API credits are unavailable. Check the connected account’s API billing before trying again.",
          402,
          "api_credits_required",
        );
      if (code === "moderation_blocked" || code === "content_policy_violation")
        throw new GenerationError(
          "OpenAI couldn’t process this photograph. Please choose a different, clear smiling photo.",
          422,
          "image_not_processed",
        );
      if (response.status === 401)
        throw new GenerationError(
          "The OpenAI API key wasn’t accepted. Update the app’s server key to reconnect.",
          503,
          "invalid_api_key",
        );
      if (response.status === 403 || response.status === 404)
        throw new GenerationError(
          "This OpenAI account doesn’t have access to the image model. Check model access and organization verification.",
          503,
          "model_access_required",
        );
      if (response.status === 429)
        throw new GenerationError(
          "OpenAI is receiving too many requests. Please wait a moment before regenerating.",
          429,
          "rate_limited",
        );
      throw new GenerationError(
        "OpenAI couldn’t create this preview. Your original photo is unchanged — please try again.",
      );
    }
    let body;
    try { body = await response.json(); }
    catch { trace?.update({ category: "malformed_response" }); throw new GenerationError("The image response couldn’t be read.", 502, "invalid_provider_image"); }
    trace?.update({ category: Array.isArray(body?.data) && body.data.length === 0 ? "empty_response" : "malformed_image", partCount: Array.isArray(body?.data) ? body.data.length : 0, imagePartExisted: typeof body?.data?.[0]?.b64_json === "string", mimeTypes: "image/jpeg" });
    const encodedResult = body?.data?.[0]?.b64_json;
    const image =
      typeof encodedResult === "string"
        ? `data:image/jpeg;base64,${encodedResult}`
        : "";
    if (!imageSchema.safeParse(image).success)
      throw new GenerationError(
        "OpenAI returned a preview that couldn’t be opened. Please try again.",
        502,
        "invalid_provider_image",
      );
    return { image, mode: "live", variationId: crypto.randomUUID() };
  }
}
