/** Bounded structural metadata only. Never pass provider bodies/errors to a log. */
export const diagnosticCategories = ["started", "success", "blocked", "transport_error", "http_error", "malformed_response", "malformed_image", "unsupported_mime", "empty_response", "thought_only", "text_only", "incomplete_response", "timeout", "cancelled", "unknown_response"] as const;
export type ProviderCategory = typeof diagnosticCategories[number];
// Google GenerateContent FinishReason / PromptFeedback.BlockReason enums.
export const finishReasons = ["FINISH_REASON_UNSPECIFIED", "STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "LANGUAGE", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_OTHER", "NO_IMAGE", "IMAGE_RECITATION", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "MALFORMED_RESPONSE", "ESCALATION", "PUP_LIMITED_DISABLED"];
const blockReasons = ["BLOCK_REASON_UNSPECIFIED", "SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"];
const providerCodes = ["INVALID_ARGUMENT", "FAILED_PRECONDITION", "OUT_OF_RANGE", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "ABORTED", "ALREADY_EXISTS", "RESOURCE_EXHAUSTED", "CANCELLED", "DATA_LOSS", "UNKNOWN", "INTERNAL", "NOT_IMPLEMENTED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED"];
const mimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/octet-stream"];
const modes = ["standard", "single_tooth", "whitening", "alignment", "full_arch"];
export interface ProviderDiagnostic {
  requestId: string; provider: string; model: string; promptVersion: string;
  category: ProviderCategory; httpStatus: number | null; latencyMs: number | null;
  retryCount: number; treatmentMode: string; selectedToothCount: number | null;
  inputWidth: number; inputHeight: number;
  requestedWidth: number | null; requestedHeight: number | null;
  requestedAspectRatio?: string; requestedResolution?: string;
  promptHash?: string; imagePartOrder?: string; referenceCount?: number; maskSent?: boolean;
  outputWidth?: number; outputHeight?: number;
  candidates?: number; partCount?: number; textParts?: number; inlineParts?: number;
  thoughtParts?: number; otherParts?: number; imagePartExisted?: boolean;
  finishReasons?: string; mimeTypes?: string; blockReason?: string; providerCode?: string;
}
export interface ProviderTrace { update: (patch: Partial<ProviderDiagnostic>) => void }
export interface DiagnosticContext {
  requestId: string;
  onDiagnostic: (record: ProviderDiagnostic) => void | Promise<void>;
}
const integer = (v: unknown, max = 10000): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const enumValue = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v) ? v : "unknown";
const enumList = (v: unknown, values: string[]) => typeof v === "string" ? [...new Set(v.split(",").slice(0, 16).map(x => enumValue(x, values)))].join(",") : undefined;

/** Also used at the client boundary: copy explicit keys, reject unknown free text. */
export function safeProviderDiagnostic(value: unknown): ProviderDiagnostic | null {
  const v = object(value);
  if (typeof v.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId)) return null;
  const result: ProviderDiagnostic = {
    requestId: v.requestId, provider: enumValue(v.provider, ["google", "openai", "http", "mock"]),
    model: typeof v.model === "string" && /^(gemini-[a-z0-9.-]{1,80}|gpt-image-[a-z0-9.-]{1,80}|custom-http|mock)$/.test(v.model) ? v.model : "unknown",
    promptVersion: typeof v.promptVersion === "string" && /^20\d\d-\d\d-\d\d-[a-z0-9-]{1,60}$/.test(v.promptVersion) ? v.promptVersion : "unknown",
    category: diagnosticCategories.includes(v.category as ProviderCategory) ? v.category as ProviderCategory : "unknown_response",
    httpStatus: integer(v.httpStatus, 599) && v.httpStatus >= 100 ? v.httpStatus : null,
    latencyMs: integer(v.latencyMs, 3_600_000) ? v.latencyMs : null,
    retryCount: integer(v.retryCount, 10) ? v.retryCount : 0,
    treatmentMode: enumValue(v.treatmentMode, modes), selectedToothCount: integer(v.selectedToothCount, 32) ? v.selectedToothCount : null,
    inputWidth: integer(v.inputWidth, 40000) ? v.inputWidth : 0, inputHeight: integer(v.inputHeight, 40000) ? v.inputHeight : 0,
    requestedWidth: integer(v.requestedWidth, 40000) ? v.requestedWidth : null, requestedHeight: integer(v.requestedHeight, 40000) ? v.requestedHeight : null,
  };
  for (const key of ["candidates", "partCount", "textParts", "inlineParts", "thoughtParts", "otherParts"] as const) if (integer(v[key])) result[key] = v[key];
  if (typeof v.imagePartExisted === "boolean") result.imagePartExisted = v.imagePartExisted;
  if (typeof v.requestedAspectRatio === "string" && /^\d{1,2}:\d{1,2}$/.test(v.requestedAspectRatio)) result.requestedAspectRatio = v.requestedAspectRatio;
  if (["512", "1K", "2K", "4K"].includes(String(v.requestedResolution))) result.requestedResolution = String(v.requestedResolution);
  if (v.finishReasons !== undefined) result.finishReasons = enumList(v.finishReasons, finishReasons);
  if (v.mimeTypes !== undefined) result.mimeTypes = enumList(v.mimeTypes, mimeTypes);
  if (v.blockReason !== undefined) result.blockReason = enumValue(v.blockReason, blockReasons);
  if (v.providerCode !== undefined) result.providerCode = enumValue(v.providerCode, providerCodes);
  if (typeof v.promptHash === "string" && /^[a-f0-9]{64}$/.test(v.promptHash)) result.promptHash = v.promptHash;
  if (typeof v.imagePartOrder === "string") {
    const roles = v.imagePartOrder.split(",");
    if (roles.length <= 9 && roles.every(role => ["source", "direct_reference", "style_reference", "edit_mask", "prompt"].includes(role))) result.imagePartOrder = v.imagePartOrder;
  }
  if (integer(v.referenceCount, 6)) result.referenceCount = v.referenceCount;
  if (typeof v.maskSent === "boolean") result.maskSent = v.maskSent;
  for (const key of ["outputWidth", "outputHeight"] as const) if (integer(v[key], 40000) && v[key] > 0) result[key] = v[key];
  return result;
}

/** Structural observations, not inferred explanations from potentially private text. */
export function inspectGeminiResponse(value: unknown): Partial<ProviderDiagnostic> {
  const b = object(value);
  const candidates = Array.isArray(b.candidates) ? b.candidates.map(object) : [];
  const parts = candidates.flatMap(c => { const parts = object(c.content).parts; return Array.isArray(parts) ? parts.map(object) : []; });
  const reasons = candidates.map(c => c.finishReason);
  const block = object(b.promptFeedback).blockReason;
  const blocked = (block !== undefined && block !== "BLOCK_REASON_UNSPECIFIED") || reasons.some(r => ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "ESCALATION", "PUP_LIMITED_DISABLED"].includes(String(r)));
  const inline = parts.filter(p => p.inlineData !== undefined);
  const images = inline.filter(p => String(object(p.inlineData).mimeType).startsWith("image/"));
  const text = parts.filter(p => typeof p.text === "string");
  const final = parts.filter(p => p.thought !== true);
  const category: ProviderCategory = blocked ? "blocked"
    : !value || typeof value !== "object" || (b.candidates !== undefined && !Array.isArray(b.candidates)) ? "unknown_response"
    : reasons.includes("MAX_TOKENS") ? "incomplete_response"
    : reasons.includes("MALFORMED_RESPONSE") ? "malformed_response"
    : reasons.some(r => r !== undefined && r !== "STOP" && r !== "NO_IMAGE") ? "unknown_response"
    : parts.length === 0 ? "empty_response"
    : final.length === 0 ? "thought_only"
    : final.some(p => p.inlineData !== undefined && !["image/png", "image/jpeg"].includes(String(object(p.inlineData).mimeType))) ? "unsupported_mime"
    : final.some(p => p.inlineData !== undefined) ? "malformed_image"
    : final.every(p => typeof p.text === "string") ? "text_only" : "unknown_response";
  return {
    category, candidates: Math.min(10000, candidates.length), partCount: Math.min(10000, parts.length),
    textParts: text.length, inlineParts: inline.length, thoughtParts: parts.filter(p => p.thought === true).length,
    otherParts: parts.filter(p => typeof p.text !== "string" && p.inlineData === undefined).length,
    imagePartExisted: images.length > 0,
    finishReasons: reasons.slice(0, 16).map(r => enumValue(r, finishReasons)).join(","),
    mimeTypes: [...new Set(inline.map(p => enumValue(object(p.inlineData).mimeType, mimeTypes)))].join(","),
    ...(block !== undefined ? { blockReason: enumValue(block, blockReasons) } : {}),
    ...(object(b.error).status !== undefined ? { providerCode: enumValue(object(b.error).status, providerCodes) } : {}),
  };
}
