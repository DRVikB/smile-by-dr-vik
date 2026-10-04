import type { SmileSettings } from "@/lib/types";
import { isNativeApp } from "@/native/platform";
import { NATIVE_API_ORIGIN } from "@/config/app";

const STAGING = "https://smile-by-dr-vik-staging.drvik.workers.dev";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const UPPER_EIGHT = [14, 13, 12, 11, 21, 22, 23, 24];

/** Private device fixture. Session material is never included in a receipt. */
export interface PhysicalQaConfig {
  version: 1;
  runId: string;
  selfTestRunId: string;
  selfTestRequestId: string;
  requestId: string;
  sourceSha256: string;
  provenance: "owner-authorised-test-photo";
  sourceName: "IMG_3291.jpg";
  settings: SmileSettings;
  resolution: "1K";
  qaUserId?: string;
  qaCaseId?: string;
  replayRunId?: string;
  session?: { access_token: string; refresh_token: string };
  replayRequestId?: string;
  rawName?: "raw.jpg" | "raw.png";
  rawSha256?: string;
}

export interface PhysicalQaResult {
  passed: boolean;
  code?: string;
  requestId?: string;
  stage?: string;
  sourceSha256?: string;
  preparedSha256?: string;
  rawSha256?: string;
  normalizedSha256?: string;
  finalSha256?: string;
  sourceLandmarks?: number;
  generatedLandmarks?: number;
  providerCalls?: number;
  httpStatus?: number;
  firstRejection?: string;
  captureEnabled?: boolean;
  writesReadBack?: boolean;
  rawBeforeValidation?: boolean;
  forcedValidationRejected?: boolean;
  rawSurvived?: boolean;
  liveClaimUntouched?: boolean;
  relaunchReadBack?: boolean;
  savedSameImage?: boolean;
  reopenedSameImage?: boolean;
}

export interface PhysicalQaAdapters {
  importSource(file: File, config: PhysicalQaConfig): Promise<void>;
  applySession?(session: NonNullable<PhysicalQaConfig["session"]>): Promise<void>;
  selfTest(config: PhysicalQaConfig, file: File, raw: string): Promise<PhysicalQaResult>;
  verifyCapture(config: PhysicalQaConfig): Promise<PhysicalQaResult>;
  runLive(config: PhysicalQaConfig): Promise<PhysicalQaResult>;
  replay(config: PhysicalQaConfig, file: File, raw: string): Promise<PhysicalQaResult>;
  verifySaved(config: PhysicalQaConfig): Promise<PhysicalQaResult>;
}

/** Exact authorised controls; accidental changes fail before any provider call. */
export function validatePhysicalQaConfig(value: unknown, runId: string, approvedHash: string): PhysicalQaConfig {
  if (!value || typeof value !== "object") throw new Error("qa_config_missing");
  const c = value as PhysicalQaConfig, s = c.settings;
  if (c.version !== 1 || !UUID.test(runId) || c.runId !== runId || !UUID.test(c.selfTestRunId) || c.selfTestRunId === c.runId || !UUID.test(c.selfTestRequestId) || c.selfTestRequestId === c.requestId ||
    !UUID.test(c.requestId) || !HASH.test(approvedHash) || c.sourceSha256 !== approvedHash ||
    c.provenance !== "owner-authorised-test-photo" || c.sourceName !== "IMG_3291.jpg" || c.resolution !== "1K" ||
    !s || s.teeth !== 8 || JSON.stringify(s.selectedTeeth) !== JSON.stringify(UPPER_EIGHT) || s.treatment !== "Layered composite" ||
    s.whitening !== true || s.alignment?.arches !== "Both" || s.alignment.only === true ||
    s.treatmentMode === "full_arch" || s.fullArch || s.shape !== "Square" || s.character !== "Balanced" ||
    s.currentShade !== "A3" || s.currentShadeSource !== "clinician" || s.targetShade !== "Bleach" ||
    s.texture !== "Natural" || s.intensity !== 67 || s.smileArc !== "Preserve existing" || s.shotType !== "Full face" ||
    s.libraryStyle !== false || s.notes !== "" || s.clinicalData || s.toothPlans?.length || s.caseFeatures?.length ||
    (c.rawName && c.rawName !== "raw.jpg" && c.rawName !== "raw.png") || (c.rawSha256 && !HASH.test(c.rawSha256)) ||
    (c.qaUserId && !UUID.test(c.qaUserId)) || (c.qaCaseId && !UUID.test(c.qaCaseId)) ||
    (c.replayRunId && (!UUID.test(c.replayRunId) || c.replayRunId === c.runId || c.replayRunId === c.selfTestRunId)) ||
    (c.session && (!c.qaUserId || typeof c.session.access_token !== "string" || typeof c.session.refresh_token !== "string"))) {
    throw new Error("qa_config_not_authorised");
  }
  return structuredClone(c);
}

export function capturePreflightPassed(result: PhysicalQaResult): boolean {
  return result.passed && result.captureEnabled === true && result.writesReadBack === true &&
    result.rawBeforeValidation === true && result.forcedValidationRejected === true && result.rawSurvived === true &&
    result.liveClaimUntouched === true;
}

/** Images, tokens and arbitrary error strings have no route into ordinary receipts. */
export function boundedPhysicalQaResult(result: PhysicalQaResult): PhysicalQaResult {
  const clean: PhysicalQaResult = { passed: result.passed === true };
  for (const key of ["code", "stage", "firstRejection"] as const) {
    const value = result[key]; if (typeof value === "string" && /^[a-z0-9_-]{1,80}$/i.test(value)) clean[key] = value;
  }
  if (result.requestId && UUID.test(result.requestId)) clean.requestId = result.requestId;
  for (const key of ["sourceSha256", "preparedSha256", "rawSha256", "normalizedSha256", "finalSha256"] as const) {
    const value = result[key]; if (value && HASH.test(value)) clean[key] = value;
  }
  for (const key of ["sourceLandmarks", "generatedLandmarks", "providerCalls", "httpStatus"] as const) {
    const value = result[key]; if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000) clean[key] = value;
  }
  for (const key of ["captureEnabled", "writesReadBack", "rawBeforeValidation", "forcedValidationRejected", "rawSurvived", "liveClaimUntouched", "relaunchReadBack", "savedSameImage", "reopenedSameImage"] as const) {
    const value = result[key]; if (typeof value === "boolean") clean[key] = value;
  }
  return clean;
}

/** Installed only in an explicitly built native staging QA bundle. */
export async function installPhysicalQaHarness(adapters: PhysicalQaAdapters): Promise<() => void> {
  if (process.env.NEXT_PUBLIC_SMILE_QA_PHYSICAL_HARNESS !== "1" || process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE !== "1" ||
    !isNativeApp() || NATIVE_API_ORIGIN !== STAGING) return () => {};
  const runId = process.env.NEXT_PUBLIC_SMILE_QA_CAPTURE_RUN_ID ?? "";
  const approvedHash = process.env.NEXT_PUBLIC_SMILE_QA_APPROVED_SOURCE_SHA256 ?? "";
  if (!UUID.test(runId) || !HASH.test(approvedHash)) throw new Error("qa_build_not_authorised");
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const base = `smile-qa/${runId}`;
  const readText = async (name: string) => {
    const entry = await Filesystem.readFile({ path: `${base}/${name}`, directory: Directory.LibraryNoCloud, encoding: Encoding.UTF8 });
    if (typeof entry.data !== "string") throw new Error("qa_text_unavailable");
    return entry.data;
  };
  const readImage = async (name: string): Promise<{ file: File; dataUrl: string; sha256: string }> => {
    const entry = await Filesystem.readFile({ path: `${base}/${name}`, directory: Directory.LibraryNoCloud });
    if (typeof entry.data !== "string") throw new Error("qa_image_unavailable");
    const bytes = Uint8Array.from(atob(entry.data), c => c.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const type = name.endsWith(".png") ? "image/png" : "image/jpeg";
    return { file: new File([bytes], name, { type }), dataUrl: `data:${type};base64,${entry.data}`, sha256 };
  };
  const config = validatePhysicalQaConfig(JSON.parse(await readText("config.json")), runId, approvedHash);
  const source = await readImage(config.sourceName);
  if (source.sha256 !== config.sourceSha256) throw new Error("qa_source_hash_mismatch");
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Private physical generation QA");
  Object.assign(panel.style, { position: "fixed", left: "8px", right: "8px", top: "72px", zIndex: "99999", background: "#fff", color: "#111", padding: "8px", border: "2px solid #876e41", fontSize: "14px" });
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = "QA ready: approved photo verified; provider disabled until preflight"; panel.append(status);
  let busy = false;
  const receipt = async (action: string, result: PhysicalQaResult) => {
    const safe = boundedPhysicalQaResult(result);
    await Filesystem.writeFile({ path: `${base}/${action}-receipt.json`, directory: Directory.LibraryNoCloud,
      encoding: Encoding.UTF8, data: JSON.stringify({ version: 1, runId, action, recordedAt: new Date().toISOString(), ...safe }), recursive: true });
    return safe;
  };
  const button = (label: string, action: string, perform: () => Promise<PhysicalQaResult>) => {
    const control = document.createElement("button"); control.type = "button"; control.textContent = label;
    Object.assign(control.style, { minHeight: "44px", padding: "8px", margin: "3px", border: "1px solid #876e41", borderRadius: "8px" });
    control.onclick = async () => {
      if (busy) return; busy = true; for (const b of panel.querySelectorAll("button")) b.disabled = true;
      status.textContent = `QA running: ${action}`;
      try { const result = await receipt(action, await perform()); status.textContent = `QA ${action}: ${result.passed ? "PASS" : "FAIL"}${result.code ? ` (${result.code})` : ""}`; }
      catch { await receipt(action, { passed: false, code: "qa_action_failed" }).catch(() => {}); status.textContent = `QA ${action}: FAIL (private receipt)`; }
      finally { busy = false; for (const b of panel.querySelectorAll("button")) b.disabled = false; }
    };
    panel.append(control);
  };
  const retained = async () => {
    if (!config.rawName || !config.rawSha256) throw new Error("qa_raw_fixture_missing");
    const raw = await readImage(config.rawName);
    if (raw.sha256 !== config.rawSha256) throw new Error("qa_raw_hash_mismatch");
    return raw.dataUrl;
  };
  button("QA capture self-test", "self-test", async () => {
    const result = await adapters.selfTest(config, source.file, await retained());
    return { ...result, passed: capturePreflightPassed(result), providerCalls: 0 };
  });
  button("QA verify capture after relaunch", "capture-relaunch", async () => {
    const prior = JSON.parse(await readText("self-test-receipt.json")) as PhysicalQaResult;
    if (!capturePreflightPassed(prior)) throw new Error("qa_preflight_not_passed");
    const result = await adapters.verifyCapture(config);
    return { ...result, passed: result.passed && result.relaunchReadBack === true, providerCalls: 0 };
  });
  button("QA sign in fixture", "fixture-sign-in", async () => {
    if (!config.session || !config.qaUserId || !adapters.applySession) throw new Error("qa_fixture_session_missing");
    // Normal SDK session adoption remounts the account workspace. It is deliberately
    // separate from the live action, which must use the new authenticated adapter.
    await adapters.applySession(config.session);
    return { passed: true, code: "qa_fixture_session_applied", providerCalls: 0 };
  });
  button("QA one authorised generation", "live", async () => {
    const selfTest = JSON.parse(await readText("self-test-receipt.json")) as PhysicalQaResult;
    const relaunch = JSON.parse(await readText("capture-relaunch-receipt.json")) as PhysicalQaResult;
    if (!capturePreflightPassed(selfTest) || relaunch.passed !== true || relaunch.relaunchReadBack !== true) throw new Error("qa_preflight_not_passed");
    // Claim is durable and is never removed on failure, timeout or relaunch.
    await Filesystem.mkdir({ path: `${base}/invocation-claimed`, directory: Directory.LibraryNoCloud, recursive: false });
    await adapters.importSource(source.file, config);
    return adapters.runLive(config);
  });
  button("QA replay retained output", "replay", async () => adapters.replay(config, source.file, await retained()));
  button("QA verify saved result", "saved-reopen", async () => adapters.verifySaved(config));
  document.body.append(panel);
  return () => panel.remove();
}
