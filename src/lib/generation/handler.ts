import { claimInMemory, validRequestId, type RequestClaim } from "./requestGuard";
import { isNoChangeDesign } from "./designPlan";
import { GenerationError } from "./errors";
import { generationSchema } from "@/lib/generation/schema";
import { AI_CONSENT_VERSION } from "@/lib/aiConsent";
import { isNativeAppOrigin } from "./cors";
import { generateSmile, getSmileProvider, providerDataTermsRequirement } from "@/lib/generation/provider";
import { accountsMode, readServerEnvironment, type ServerEnvironment } from "@/server/env";
import { accountServicesFromEnv, authenticate, evaluateAccess, type AccountServices } from "@/server/access";
import { AccountError } from "@/server/accountStore";
import { selectStyleReferences } from "@/server/caseLibraryHandlers";

const ACCOUNT_ERRORS: Record<AccountError["code"], { status: number; error: string }> = {
  auth_required: { status: 401, error: "Sign in to your SmileCompose account to generate a smile." },
  mfa_required: { status: 401, error: "Enter your two-factor code to continue." },
  rate_limited: { status: 429, error: "Too many generation requests. Please wait a minute and try again." },
  subscription_required: { status: 402, error: "SmileCompose Pro is required to generate smiles." },
  allowance_exhausted: { status: 429, error: "You’ve used all generations included in this billing period." },
  no_active_allowance: { status: 402, error: "No generation allowance is active for this account." },
  duplicate_request: { status: 409, error: "This request has already been submitted." },
  account_not_found: { status: 401, error: "Sign in to your SmileCompose account to generate a smile." },
  account_service_unavailable: { status: 503, error: "Your account couldn’t be checked. No generation was counted. Please try again." },
};

/**
 * Live generation with accounts enabled:
 *   authenticate → confirm Pro (RevenueCat or server override) → reserve one
 *   generation → call the provider → commit on success / refund on failure.
 * `accounts` may be injected (tests); otherwise it is built from the environment.
 */
export async function handleGenerationRequest(
  request: Request,
  env?: ServerEnvironment,
  claim: RequestClaim = claimInMemory,
  accounts?: AccountServices | null,
) {
  const headers = { "Cache-Control": "no-store" };
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json(
      { error: "Send a photo and settings as JSON." },
      { status: 415, headers },
    );
  const origin = request.headers.get("origin");
  // The packaged iOS app is the only permitted cross-origin caller.
  const nativeApp = isNativeAppOrigin(origin);
  // Next may use its bind address internally; the browser-facing Host remains authoritative.
  let sameOrigin = !origin || nativeApp;
  if (origin && !nativeApp) {
    try {
      const source = new URL(origin);
      sameOrigin =
        source.origin === new URL(request.url).origin ||
        source.host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin || (!nativeApp && request.headers.get("sec-fetch-site") === "cross-site"))
    return Response.json(
      { error: "This request could not be verified." },
      { status: 403, headers },
    );
  // Cap the body before decoding to avoid buffering an arbitrarily large upload.
  let raw = "";
  let bytes = 0;
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader)
    return Response.json(
      { error: "A photo is required." },
      { status: 400, headers },
    );
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 24_000_000) {
        await reader.cancel();
        return Response.json(
          { error: "Photo is too large. Please try a smaller image." },
          { status: 413, headers },
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return Response.json(
      { error: "The photo could not be received. Please try again." },
      { status: 400, headers },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "The request could not be read." },
      { status: 400, headers },
    );
  }
  const parsed = generationSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check the photo and design selections, then try again." },
      { status: 400, headers },
    );
  try {
    const provider = getSmileProvider(env);
    if (provider.configured === false)
      throw new GenerationError("AI generation isn’t connected on the server. No provider request was sent.", 503, "provider_not_configured");
    const serverEnv = env ?? readServerEnvironment();
    // Patient photos reach a provider only under deliberately confirmed terms:
    // Google paid / Vertex (never the unpaid tier), and likewise for any other adapter.
    const terms = providerDataTermsRequirement(provider);
    if (terms && serverEnv[terms.variable] !== terms.value)
      return Response.json({ error: "AI processing terms have not been confirmed on the server. No provider request was sent.", code: "provider_terms_unconfirmed" }, { status: 503, headers });
    if (isNoChangeDesign(parsed.data.settings)) return Response.json({ error: "No change selected. Choose teeth and a goal or shade that makes a change." }, { status: 400, headers });
    if (provider.name !== "mock" && request.headers.get("X-Smile-AI-Consent") !== AI_CONSENT_VERSION)
      return Response.json({ error: "Clinician permission is required before sending this photo to Google AI. No provider request was sent.", code: "ai_consent_required" }, { status: 428, headers });
    const id = request.headers.get("X-Smile-Request-Id");
    if (provider.name !== "mock" && !id) return Response.json({ error: "Refresh SmileCompose to update the app before generating. No AI request was sent.", code: "missing_request_id" }, { status: 400, headers });
    if (id) {
      if (!validRequestId(id)) return Response.json({ error: "Invalid generation request identifier." }, { status: 400, headers });
      try {
        if (!await claim(id)) return Response.json({ error: "This request has already been submitted. Check the saved result before creating another preview; the earlier request may have incurred a charge.", code: "duplicate_request" }, { status: 409, headers });
      } catch {
        return Response.json({ error: "Generation paused because duplicate-request protection is unavailable. No AI request was sent. Please try again shortly.", code: "request_guard_unavailable" }, { status: 503, headers });
      }
    }
    let reservation: { services: AccountServices; id: string } | null = null;
    let usage: { remaining: number } | undefined;
    let accountUserId: string | null = null;
    if (provider.name !== "mock") {
      const mode = accounts ? "required" : accountsMode(serverEnv);
      if (mode === "misconfigured")
        return Response.json({ error: "Accounts are not configured on the server. No AI request was sent.", code: "accounts_unavailable" }, { status: 503, headers });
      if (mode === "required") {
        const services = accounts ?? accountServicesFromEnv(serverEnv)!;
        try {
          const user = await authenticate(request, services);
          if (!user) throw new AccountError("auth_required");
          if (!(await evaluateAccess(user, services)).pro) throw new AccountError("subscription_required");
          usage = await services.store.reserve(user.id, id!, parsed.data.caseId ?? null);
          reservation = { services, id: id! };
          accountUserId = user.id;
        } catch (error) {
          const code = error instanceof AccountError ? error.code : "account_service_unavailable";
          return Response.json({ ...ACCOUNT_ERRORS[code], code }, { status: ACCOUNT_ERRORS[code].status, headers });
        }
      }
    }
    if (reservation && accountUserId) {
      // Accountability record of the clinician's AI-processing confirmation (no patient data).
      await reservation.services.store.recordConsent(accountUserId, "ai_processing", AI_CONSENT_VERSION, parsed.data.caseId ?? null).catch(() => {});
    }
    // AI input minimisation: the provider receives the images and design
    // parameters only; the case ID, account and billing data stay here.
    // Case Library style references are attached only when "Use my Case Library"
    // is on. With accounts, the SERVER chooses them from the signed-in user's own
    // private library; images sent by the client are ignored. Without accounts
    // (local development only) the device library's references are accepted.
    const { caseId, styleReferences: clientStyleReferences, ...rest } = parsed.data;
    void caseId;
    let styleReferences: string[] = [];
    let referenceCaseIds: string[] = [];
    if (rest.settings.libraryStyle) {
      if (reservation && accountUserId) {
        const selected = await selectStyleReferences(reservation.services, accountUserId, rest.settings)
          .catch(() => ({ images: [] as string[], caseIds: [] as string[] }));
        styleReferences = selected.images;
        referenceCaseIds = selected.caseIds;
      } else if (!reservation) {
        styleReferences = clientStyleReferences ?? [];
      }
    }
    const providerInput = styleReferences.length ? { ...rest, styleReferences } : rest;
    let result;
    try {
      result = await generateSmile(providerInput, request.signal, provider);
    } catch (error) {
      // Failed before completion: return the reserved generation.
      await reservation?.services.store.release(reservation.id, error instanceof GenerationError ? error.code : "generation_failed").catch(() => {});
      throw error;
    }
    if (reservation) {
      await reservation.services.store.commit(reservation.id, {
        provider: result.generation?.provider, model: result.generation?.model, providerRequestId: result.variationId,
        promptVersion: result.generation?.promptVersion,
        treatmentType: `${parsed.data.settings.treatment} / ${parsed.data.settings.designIntent ?? "Auto"}`,
        referenceCaseIds,
      }).catch(() => {});
    }
    const styleReferencesUsed = { count: styleReferences.length, caseIds: referenceCaseIds };
    return Response.json({ ...result, styleReferencesUsed, ...(usage ? { usage } : {}) }, { headers });
  } catch (error) {
    if (error instanceof GenerationError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    return Response.json(
      {
        error:
          "We couldn’t create your preview. Your photo and selections are safe — please try again.",
      },
      { status: 502, headers },
    );
  }
}
