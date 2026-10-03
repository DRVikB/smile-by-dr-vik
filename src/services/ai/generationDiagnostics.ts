import { safeAlignmentDiagnostic, safeRawOutputDiagnostic, safeOutputGeometry, type OutputGeometryDiagnostic, type MouthAlignmentDiagnostic, type RawOutputDiagnostic } from "@/lib/face/alignmentDiagnostic";
import { safeProviderDiagnostic, type ProviderDiagnostic } from "@/lib/generation/providerDiagnostics";
import { isNativeApp } from "@/native/platform";
import { MOUTH_LOCK_FAILURE_CODES } from "@/lib/face/lock";

const stages = ["preflight", "prepare_image", "prepare_mask", "request", "response", "align", "mouth_composite", "edit_area_composite", "arch_composite", "tooth_composite", "quality_check", "complete"] as const;
export type GenerationStage = typeof stages[number];
export interface GenerationDiagnostic {
  providerDiagnostic?: ProviderDiagnostic;
  alignment?: MouthAlignmentDiagnostic;
  geometry?: OutputGeometryDiagnostic;
  rawOutput?: RawOutputDiagnostic;
  rawQaCapture?: "disabled" | "ineligible" | "saved" | "failed";
  requestId: string;
  timestamp: number;
  generationPath: "standard" | "single_tooth" | "custom" | "alignment" | "full_arch";
  selectedToothCount: number;
  sourceWidth: number;
  sourceHeight: number;
  requestWidth?: number;
  requestHeight?: number;
  serverStatus: number | null;
  stage: GenerationStage;
  outcome: "running" | "succeeded" | "failed" | "reused";
  errorCode?: string;
}
const errorCodes = new Set(["offline", "network", "timeout", "cancelled", "invalid_result", "invalid_request", "image_too_large", "request_rejected", "unavailable", "auth_required", "subscription_required", "allowance_exhausted", "account_service_unavailable", "accounts_unavailable", "mfa_required", "ai_consent_required", "duplicate_request", "request_guard_unavailable", "provider_not_configured", "invalid_api_key", "model_access_required", "provider_unavailable", "rate_limited", "generation_timeout", "image_not_processed", "provider_no_image", "invalid_provider_image", "generation_failed", "missing_request_id", "provider_terms_unconfirmed"]);
const paths = new Set(["standard", "single_tooth", "custom", "alignment", "full_arch"]);
for (const code of MOUTH_LOCK_FAILURE_CODES) errorCodes.add(code);
const bounded = (n: unknown, max: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;

/** Explicit allowlist: never serialize the request, settings, images or Error object. */
export function safeGenerationDiagnostic(value: GenerationDiagnostic): GenerationDiagnostic | null {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId)
    || !paths.has(value.generationPath) || !stages.includes(value.stage)
    || !["running", "succeeded", "failed", "reused"].includes(value.outcome)
    || !bounded(value.timestamp, 9e15) || !bounded(value.selectedToothCount, 32)
    || !bounded(value.sourceWidth, 40000) || !bounded(value.sourceHeight, 40000)) return null;
  const providerDiagnostic = safeProviderDiagnostic(value.providerDiagnostic);
  return {
    ...(providerDiagnostic?.requestId === value.requestId ? { providerDiagnostic } : {}),
    ...(safeAlignmentDiagnostic(value.alignment) ? { alignment: safeAlignmentDiagnostic(value.alignment) } : {}),
    ...(safeOutputGeometry(value.geometry) ? { geometry: safeOutputGeometry(value.geometry) } : {}),
    ...(safeRawOutputDiagnostic(value.rawOutput) ? { rawOutput: safeRawOutputDiagnostic(value.rawOutput) } : {}),
    ...(["disabled", "ineligible", "saved", "failed"].includes(value.rawQaCapture ?? "") ? { rawQaCapture: value.rawQaCapture } : {}),
    requestId: value.requestId, timestamp: value.timestamp,
    generationPath: value.generationPath, selectedToothCount: value.selectedToothCount,
    sourceWidth: value.sourceWidth, sourceHeight: value.sourceHeight,
    ...(bounded(value.requestWidth, 40000) ? { requestWidth: value.requestWidth } : {}),
    ...(bounded(value.requestHeight, 40000) ? { requestHeight: value.requestHeight } : {}),
    serverStatus: bounded(value.serverStatus, 599) && value.serverStatus! >= 100 ? value.serverStatus : null,
    stage: value.stage, outcome: value.outcome,
    ...(value.errorCode ? { errorCode: errorCodes.has(value.errorCode) ? value.errorCode : "stage_failed" } : {}),
  };
}

let pending = Promise.resolve();
let records: GenerationDiagnostic[] | undefined;
const path = "smile-generation-qa.json";

/** Opt-in staging QA only. Bounded on-device cache; no console, analytics or network logging. */
function persist(value: GenerationDiagnostic) {
  if (process.env.NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS !== "1" || !isNativeApp()) return;
  const safe = safeGenerationDiagnostic(value);
  if (!safe) return;
  pending = pending.catch(() => {}).then(async () => {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    if (!records) {
      records = [];
      try {
        const saved = await Filesystem.readFile({ path, directory: Directory.Cache, encoding: Encoding.UTF8 });
        const parsed: unknown = JSON.parse(String(saved.data));
        if (Array.isArray(parsed)) records = parsed.slice(-30).map(safeGenerationDiagnostic).filter((x): x is GenerationDiagnostic => x !== null);
      } catch { /* Missing/evicted cache is normal. */ }
    }
    records = [...records.filter(r => r.requestId !== safe.requestId), safe].slice(-30);
    await Filesystem.writeFile({ path, directory: Directory.Cache, encoding: Encoding.UTF8, data: JSON.stringify(records), recursive: true });
  }).catch(() => { /* Diagnostics must never block generation. */ });
}

export function startGenerationDiagnostic(initial: Omit<GenerationDiagnostic, "timestamp" | "serverStatus" | "stage" | "outcome">) {
  let value: GenerationDiagnostic = { ...initial, timestamp: Date.now(), serverStatus: null, stage: "preflight", outcome: "running" };
  const update = (patch: Partial<GenerationDiagnostic>) => { value = { ...value, ...patch, timestamp: Date.now() }; persist(value); };
  persist(value);
  return {
    alignment: (alignment: MouthAlignmentDiagnostic) => update({ alignment }),
    geometry: (geometry: OutputGeometryDiagnostic) => update({ geometry }),
    rawOutput: (rawOutput: RawOutputDiagnostic) => update({ rawOutput }),
    rawQaCapture: (rawQaCapture: GenerationDiagnostic["rawQaCapture"]) => update({ rawQaCapture }),
    stage: (stage: GenerationStage) => update({ stage }),
    dimensions: (requestWidth: number, requestHeight: number) => update({ requestWidth, requestHeight }),
    provider: (providerDiagnostic: ProviderDiagnostic) => update({ providerDiagnostic }),
    response: (serverStatus: number) => update({ serverStatus, stage: "response" }),
    finish: (outcome: "succeeded" | "reused") => update({ outcome, stage: "complete" }),
    fail: (code: string) => update({ outcome: "failed", errorCode: code }),
  };
}
