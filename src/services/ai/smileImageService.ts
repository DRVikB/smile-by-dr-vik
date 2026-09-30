import type { Framing, GenerationResult, SmileSettings } from "@/lib/types";
import type { ImageResolution } from "@/lib/generation/cost";
import { modeForResolution } from "@/lib/generation/modes";
import { imageSchema } from "@/lib/generation/schema";
import { apiUrl } from "@/services/api/client";
import { emitGenerationEvent } from "./generationEvents";
import { canGenerate, getEntitlementProvider } from "@/services/entitlements/entitlements";

/**
 * SmileImageService — the single client entry point for AI smile generation.
 * Screens call this, never the backend or an AI provider directly.
 *
 *   UI → SmileImageService → POST /api/generate-smile (SmileCompose backend)
 *      → SmileImageProvider (GeminiSmileProvider) → Google Gemini
 *
 * The provider API key exists only on the backend.
 */
export interface SmileGenerationRequest {
  caseId?: string;
  originalImage: string;
  sourceBounds?: Framing;
  framing?: Framing;
  resolution: ImageResolution;
  referenceImage?: string;
  settings: SmileSettings;
  /** Clinician's AI-processing attestation version for this photo. */
  consentVersion?: string;
}

/** A failure that is safe to show the clinician. Never contains provider details. */
export class SmileGenerationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "SmileGenerationError";
  }
}

const NOT_COUNTED = "Your generation has not been counted.";

export const GENERATION_MESSAGES = {
  failed: `We couldn’t create this smile preview. ${NOT_COUNTED} Please try again.`,
  offline: "You’re offline. Connect to the internet to create a new smile.",
  network: `We couldn’t reach SmileCompose. Check your connection and try again. ${NOT_COUNTED}`,
  timeout: `This preview took too long. ${NOT_COUNTED} Please try again.`,
  invalidImage: "We couldn’t create a preview from this photograph. Please try a clear, well-lit, front-facing smile photo.",
  tooLarge: "This photo is too large to send. Please try a smaller image.",
  unavailable: `Smile generation is temporarily unavailable. ${NOT_COUNTED} Please try again later.`,
  busy: `SmileCompose is busy right now. Please wait a moment and try again. ${NOT_COUNTED}`,
  consent: "Clinician permission is required before this photo is sent for AI processing. No request was sent.",
  duplicate: "This request has already been submitted. Check the saved result before creating another preview; the earlier request may have incurred a charge.",
  paused: "Generation is paused for a moment. No request was sent. Please try again shortly.",
  allowance: "Your generation allowance has been used. No request was sent.",
  selection: "Check the photo and design selections, then try again.",
  outdated: "Please update SmileCompose to the latest version before generating. No request was sent.",
  signIn: "Sign in to your SmileCompose account to generate a smile. No request was sent.",
  subscribe: "SmileCompose Pro is required to generate smiles. No request was sent.",
  allowanceUsed: "You’ve used your available SmileCompose generations. No request was sent.",
  accountUnavailable: `Your account couldn’t be checked right now. ${NOT_COUNTED} Please try again.`,
  mfa: "Enter your two-factor code to continue. No request was sent.",
} as const;

/** Map a backend error to clinician-facing copy. Raw provider text is never shown. */
export function friendlyGenerationError(status: number, code?: string): SmileGenerationError {
  const byCode: Record<string, string> = {
    ai_consent_required: GENERATION_MESSAGES.consent,
    duplicate_request: GENERATION_MESSAGES.duplicate,
    request_guard_unavailable: GENERATION_MESSAGES.paused,
    provider_not_configured: GENERATION_MESSAGES.unavailable,
    invalid_api_key: GENERATION_MESSAGES.unavailable,
    model_access_required: GENERATION_MESSAGES.unavailable,
    provider_unavailable: GENERATION_MESSAGES.unavailable,
    rate_limited: GENERATION_MESSAGES.busy,
    generation_timeout: GENERATION_MESSAGES.timeout,
    image_not_processed: GENERATION_MESSAGES.invalidImage,
    invalid_provider_image: GENERATION_MESSAGES.failed,
    generation_failed: GENERATION_MESSAGES.failed,
    missing_request_id: GENERATION_MESSAGES.outdated,
    auth_required: GENERATION_MESSAGES.signIn,
    subscription_required: GENERATION_MESSAGES.subscribe,
    no_active_allowance: GENERATION_MESSAGES.subscribe,
    allowance_exhausted: GENERATION_MESSAGES.allowanceUsed,
    GENERATION_LIMIT_REACHED: GENERATION_MESSAGES.allowanceUsed,
    account_service_unavailable: GENERATION_MESSAGES.accountUnavailable,
    accounts_unavailable: GENERATION_MESSAGES.unavailable,
    provider_terms_unconfirmed: GENERATION_MESSAGES.unavailable,
    mfa_required: GENERATION_MESSAGES.mfa,
  };
  // One code for "none left", whichever server version answered.
  if (code === "GENERATION_LIMIT_REACHED") return new SmileGenerationError(byCode[code], "allowance_exhausted");
  if (code && byCode[code]) return new SmileGenerationError(byCode[code], code);
  if (status === 413) return new SmileGenerationError(GENERATION_MESSAGES.tooLarge, "image_too_large");
  if (status === 400 || status === 415 || status === 422) return new SmileGenerationError(GENERATION_MESSAGES.selection, "invalid_request");
  if (status === 401) return new SmileGenerationError(GENERATION_MESSAGES.signIn, "auth_required");
  if (status === 402) return new SmileGenerationError(GENERATION_MESSAGES.subscribe, "subscription_required");
  if (status === 403) return new SmileGenerationError(GENERATION_MESSAGES.unavailable, "request_rejected");
  if (status === 429) return new SmileGenerationError(GENERATION_MESSAGES.busy, "rate_limited");
  if (status === 503) return new SmileGenerationError(GENERATION_MESSAGES.unavailable, "unavailable");
  if (status === 504) return new SmileGenerationError(GENERATION_MESSAGES.timeout, "generation_timeout");
  return new SmileGenerationError(GENERATION_MESSAGES.failed, code ?? "generation_failed");
}

export interface GenerateOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  online?: () => boolean;
  /** Supabase access token for the signed-in account (required when accounts are enabled). */
  accessToken?: string | null;
  /** Called immediately before the network request, once a charge is possible. */
  onSubmitted?: () => void;
  timeoutMs?: number;
}

export async function generateSmileImage(
  request: SmileGenerationRequest,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const { signal, fetcher = (input, init) => globalThis.fetch(input, init), online = () => navigator.onLine, timeoutMs = 255_000 } = options;
  const mode = modeForResolution(request.resolution);
  if (!online()) throw new SmileGenerationError(GENERATION_MESSAGES.offline, "offline");
  const entitlements = getEntitlementProvider();
  if (!canGenerate(await entitlements.current())) throw new SmileGenerationError(GENERATION_MESSAGES.allowance, "allowance_exhausted");
  if (signal?.aborted) throw signal.reason;

  const requestId = crypto.randomUUID();
  const base = { requestId, caseId: request.caseId, mode } as const;
  emitGenerationEvent({ ...base, type: "started", timestamp: Date.now() });
  const fail = (error: SmileGenerationError) => {
    emitGenerationEvent({ ...base, type: "failed", timestamp: Date.now(), errorCode: error.code });
    return error;
  };

  options.onSubmitted?.();
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetcher(apiUrl("/api/generate-smile"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Smile-Request-Id": requestId,
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(request.consentVersion ? { "X-Smile-AI-Consent": request.consentVersion } : {}),
      },
      body: JSON.stringify({
        caseId: request.caseId || undefined,
        originalImage: request.originalImage,
        sourceBounds: request.sourceBounds,
        resolution: request.resolution,
        generationMode: mode,
        referenceImage: request.referenceImage,
        framing: request.framing,
        settings: request.settings,
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) {
      emitGenerationEvent({ ...base, type: "failed", timestamp: Date.now(), errorCode: "cancelled" });
      throw error;
    }
    throw fail(timeout.aborted
      ? new SmileGenerationError(GENERATION_MESSAGES.timeout, "timeout")
      : new SmileGenerationError(GENERATION_MESSAGES.network, "network"));
  }

  const body = await response.json().catch(() => null) as (Partial<GenerationResult> & { code?: string }) | null;
  if (!response.ok || !body) throw fail(friendlyGenerationError(response.status, body?.code));
  if (!imageSchema.safeParse(body.image).success || !["mock", "live"].includes(String(body.mode)))
    throw fail(new SmileGenerationError(GENERATION_MESSAGES.failed, "invalid_result"));

  const result = { ...(body as GenerationResult), requestId };
  emitGenerationEvent({
    ...base,
    type: "succeeded",
    timestamp: Date.now(),
    provider: result.generation?.provider,
    model: result.generation?.model,
  });
  if (result.mode === "live") await entitlements.recordGeneration().catch(() => {});
  return result;
}
