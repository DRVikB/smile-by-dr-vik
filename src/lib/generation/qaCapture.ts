import type { ServerEnvironment } from "@/server/env";
import type { GenerationInput } from "./schema";
import { validRequestId } from "./requestGuard";
import type { ProviderImagePartDiagnostic } from "./providerDiagnostics";

/** Private, one-request QA transport. Never send this envelope to logging or saved cases. */
export interface QaImagePart extends ProviderImagePartDiagnostic {
  selected: boolean;
  image?: string;
  omitted?: "unsupported_mime" | "invalid_encoding" | "size_limit";
}
export interface QaCaptureEnvelope {
  runId: string;
  requestId: string;
  sourceSha256: string;
  validatedRequest: Omit<GenerationInput, "originalImage" | "editMask" | "referenceImage" | "styleReferences"> & {
    referenceImage: false; styleReferenceCount: 0; maskGuidance: false;
  };
  parts: QaImagePart[];
  omittedPartCount: number;
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
}
export const qaSettingsSha256 = (settings: GenerationInput["settings"]) => digest(new TextEncoder().encode(JSON.stringify(canonical(settings))));
export const qaSourceSha256 = (image: string) => digest(Uint8Array.from(atob(image.split(",")[1]), c => c.charCodeAt(0)));
type Authorization = { state: "off" } | { state: "rejected" } | { state: "approved"; envelope: QaCaptureEnvelope };

/** Every pin is server-controlled; an arbitrary signed-in patient case cannot opt in. */
export async function qaCaptureAuthorization(url: string, env: ServerEnvironment, userId: string, requestId: string, input: GenerationInput): Promise<Authorization> {
  if (env.SMILE_QA_CAPTURE_ENABLED !== "1" || userId !== env.SMILE_QA_CAPTURE_USER_ID) return { state: "off" };
  if (new URL(url).origin !== "https://smile-by-dr-vik-staging.drvik.workers.dev" ||
      env.SUPABASE_URL !== "https://wukcqlpuzkzwxmdkotfg.supabase.co" || env.SMILE_PROVIDER !== "gemini" || env.SMILE_MASK_GUIDANCE === "on" ||
      !validRequestId(env.SMILE_QA_CAPTURE_RUN_ID ?? "") || !validRequestId(env.SMILE_QA_CAPTURE_REQUEST_ID ?? "") ||
      requestId !== env.SMILE_QA_CAPTURE_REQUEST_ID || !/^[a-f0-9]{64}$/.test(env.SMILE_QA_CAPTURE_SOURCE_SHA256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(env.SMILE_QA_CAPTURE_SETTINGS_SHA256 ?? "") || input.referenceImage || input.styleReferences?.length || input.settings.libraryStyle ||
      input.settings.notes || input.settings.clinicalData) return { state: "rejected" };
  const sourceSha256 = await qaSourceSha256(input.originalImage);
  if (sourceSha256 !== env.SMILE_QA_CAPTURE_SOURCE_SHA256 || await qaSettingsSha256(input.settings) !== env.SMILE_QA_CAPTURE_SETTINGS_SHA256) return { state: "rejected" };
  const { originalImage, editMask, referenceImage, styleReferences, ...validated } = input;
  void originalImage; void editMask; void referenceImage; void styleReferences;
  return { state: "approved", envelope: { runId: env.SMILE_QA_CAPTURE_RUN_ID!, requestId, sourceSha256,
    validatedRequest: { ...validated, referenceImage: false, styleReferenceCount: 0, maskGuidance: false }, parts: [], omittedPartCount: 0 } };
}
