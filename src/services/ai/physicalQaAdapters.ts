import type { AccountContextValue } from "@/components/account/AccountProvider";
import type { CaseRepository } from "@/services/cases/caseRepository";
import type { Framing, GenerationResult, Photo, SmileCase, SmileSettings } from "@/lib/types";
import type { GenerationDiagnostic, GenerationStage } from "./generationDiagnostics";
import type { SyntheticQaCapture } from "./syntheticQaCapture";
import type { PhysicalQaAdapters, PhysicalQaConfig, PhysicalQaResult } from "./physicalQaHarness";
import { AI_CONSENT_VERSION, fingerprintPhotoForConsent, type AiProcessingConsent } from "@/lib/aiConsent";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { preparePhoto } from "@/lib/photos";
import { thumbnail } from "@/lib/thumb";
import { fetchAccountStatus } from "@/services/account/accountApi";
import { createNativeQaCaptureForRun, getLocalQaCapture, qaCaptureConfiguration } from "./syntheticQaCapture";
import type { QaCaptureEnvelope } from "@/lib/generation/qaCapture";

/** Only the transport is replaced in replay; the production processing stays unchanged. */
export interface PrivateReplayBoundary {
  requestId: string;
  retainedResult?: GenerationResult;
  capture?: SyntheticQaCapture;
  prepared?(canvas: Photo, outgoing: string, sourceBounds: Framing, settings: SmileSettings): Promise<void>;
  receipt?(diagnostic: GenerationDiagnostic | null): Promise<void>;
}
export interface PhysicalQaBindings {
  current(): {
    photo: Photo | null; settings: SmileSettings; account: AccountContextValue; repository: CaseRepository;
    caseId: string; ready: boolean; testMode: boolean; effectiveResolution: string; reference: Photo | null;
    requestPreview(photo: Photo, settings: SmileSettings, controller: AbortController, consentVersion?: string,
      onStage?: (stage: GenerationStage) => void, qa?: PrivateReplayBoundary): Promise<GenerationResult>;
  };
  importSource(file: File, config: PhysicalQaConfig): Promise<void>;
  applySession(session: NonNullable<PhysicalQaConfig["session"]>): Promise<void>;
  displayResult(result: GenerationResult): void;
  restoreWorkingCase?(draft: SmileCase): void;
}
const hashBytes = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
const hashImage = async (image: string) => hashBytes(await (await fetch(image)).arrayBuffer());
async function localIo(runId: string) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const base = `smile-qa/${runId}`;
  return {
    write: (name: string, value: unknown) => Filesystem.writeFile({ path: `${base}/${name}`, directory: Directory.LibraryNoCloud, encoding: Encoding.UTF8, data: JSON.stringify(value), recursive: true }),
    read: async (name: string) => JSON.parse(String((await Filesystem.readFile({ path: `${base}/${name}`, directory: Directory.LibraryNoCloud, encoding: Encoding.UTF8 })).data)),
    liveCaptureClaimAbsent: async () => { try { await Filesystem.stat({ path: `smile-qa-capture-runs/live/${runId}`, directory: Directory.LibraryNoCloud }); return false; } catch { return true; } },
  };
}
function reportResult(diagnostic: GenerationDiagnostic | null): PhysicalQaResult {
  return { passed: diagnostic?.outcome === "succeeded", requestId: diagnostic?.requestId, stage: diagnostic?.stage,
    sourceLandmarks: diagnostic?.alignment?.sourceLandmarkCount, generatedLandmarks: diagnostic?.alignment?.generatedLandmarkCount,
    firstRejection: diagnostic?.alignment?.rejection ?? diagnostic?.alignment?.generatedFaceFailure, httpStatus: diagnostic?.serverStatus ?? undefined,
    ...(diagnostic?.providerDiagnostic ? { providerCalls: 1 + diagnostic.providerDiagnostic.retryCount } : {}) };
}

/** Preserve each image part before the service validates or downstream code rejects it. */
export async function captureProviderEnvelope(requestId: string, source: string, value: unknown): Promise<void> {
  const config = qaCaptureConfiguration();
  if (!config.enabled || !config.runId || !value || typeof value !== "object") throw new Error("qa_envelope_disabled");
  const envelope = value as QaCaptureEnvelope;
  if (envelope.runId !== config.runId || envelope.requestId !== requestId || !Array.isArray(envelope.parts) || envelope.parts.length > 16 ||
    !Number.isInteger(envelope.omittedPartCount) || envelope.omittedPartCount < 0 || envelope.omittedPartCount > 1000 ||
    !envelope.validatedRequest || envelope.validatedRequest.referenceImage !== false || envelope.validatedRequest.styleReferenceCount !== 0 ||
    envelope.validatedRequest.maskGuidance !== false || envelope.validatedRequest.settings.notes || envelope.validatedRequest.settings.clinicalData) throw new Error("qa_envelope_invalid");
  const capture = getLocalQaCapture(), evidence = await capture.verifyEvidence(requestId);
  if (!evidence.ok || evidence.files["provider-input"]?.sha256 !== envelope.sourceSha256) throw new Error("qa_envelope_source_mismatch");
  if (envelope.parts.length && await capture.captureParts(requestId, source, envelope.parts) !== "saved") throw new Error("qa_parts_capture_failed");
  const io = await localIo(config.runId);
  await io.write("provider-receipt.json", { runId: envelope.runId, requestId, sourceSha256: envelope.sourceSha256,
    validatedRequest: envelope.validatedRequest, omittedPartCount: envelope.omittedPartCount,
    parts: envelope.parts.map(part => ({ candidateIndex: part.candidateIndex, partIndex: part.partIndex, thought: part.thought,
      mimeType: part.mimeType, width: part.width, height: part.height, finishReason: part.finishReason, selected: part.selected, omitted: part.omitted })) });
}

export function createPhysicalQaAdapters(bindings: PhysicalQaBindings): PhysicalQaAdapters {
  const options = async (config: PhysicalQaConfig, requestId: string, label: string, capture?: SyntheticQaCapture, raw?: string) => {
    const io = await localIo(config.runId);
    let diagnostic: GenerationDiagnostic | null = null;
    const qa: PrivateReplayBoundary = { requestId, capture,
      ...(raw ? { retainedResult: { image: raw, mode: "live" as const, variationId: requestId } } : {}),
      prepared: async (canvas, outgoing, sourceBounds, settings) => {
        await io.write(`${label}-submitted-receipt.json`, { requestId, replayOf: raw ? config.requestId : undefined,
          sourceSha256: config.sourceSha256, outgoingSha256: await hashImage(outgoing), width: canvas.width, height: canvas.height,
          sourceBounds, settings: structuredClone(settings), resolution: "1K", directReferences: 0, styleReferences: 0, libraryStyle: false, providerMaskGuidance: false });
      },
      receipt: async value => { diagnostic = value; await io.write(`${label}-processing-receipt.json`, value); },
    };
    return { qa, report: () => reportResult(diagnostic) };
  };
  const selfTestFiles = async (config: PhysicalQaConfig) => createNativeQaCaptureForRun(config.selfTestRunId, "offline-self-test").verifyEvidence(config.selfTestRequestId);
  return {
    applySession: bindings.applySession,
    importSource: bindings.importSource,
    selfTest: async (config, file, raw) => {
      const io = await localIo(config.runId), initialClaimAbsent = await io.liveCaptureClaimAbsent();
      const photo = await preparePhoto(file), capture = createNativeQaCaptureForRun(config.selfTestRunId, "offline-self-test");
      if (!await capture.register(file, photo.dataUrl)) return { passed: false, code: "qa_source_not_registered", providerCalls: 0 };
      const controls = await options(config, config.selfTestRequestId, "self-test", capture, raw);
      let rejected = false;
      try { await bindings.current().requestPreview(photo, config.settings, new AbortController(), AI_CONSENT_VERSION, undefined, controls.qa); }
      catch { rejected = true; }
      const evidence = await capture.verifyEvidence(config.selfTestRequestId), report = controls.report();
      const rawHash = await hashImage(raw);
      const rawSurvived = evidence.ok && evidence.files.raw?.sha256 === rawHash;
      const preparedWritten = Boolean(evidence.files["provider-input"]?.sha256);
      const originalVerified = evidence.files.original?.sha256 === config.sourceSha256;
      const liveClaimUntouched = initialClaimAbsent && await io.liveCaptureClaimAbsent();
      await io.write("self-test-evidence.json", evidence);
      return { ...report, passed: rejected && rawSurvived && preparedWritten && originalVerified && liveClaimUntouched,
        code: rejected ? "qa_forced_rejection_retained" : "qa_forced_rejection_not_observed", sourceSha256: config.sourceSha256,
        preparedSha256: evidence.files["provider-input"]?.sha256, rawSha256: rawHash, providerCalls: 0,
        captureEnabled: qaCaptureConfiguration().enabled, writesReadBack: evidence.ok, rawBeforeValidation: Boolean(report.firstRejection) && rawSurvived,
        forcedValidationRejected: rejected, rawSurvived, liveClaimUntouched };
    },
    verifyCapture: async config => {
      const io = await localIo(config.runId), before = await io.read("self-test-evidence.json"), after = await selfTestFiles(config);
      const same = after.ok && JSON.stringify(before.files) === JSON.stringify(after.files) && before.manifestSha256 === after.manifestSha256;
      return { passed: same && await io.liveCaptureClaimAbsent(), relaunchReadBack: same, rawSha256: after.files.raw?.sha256, providerCalls: 0 };
    },
    runLive: async config => {
      const current = bindings.current(), { account, repository, photo } = current;
      if (!config.qaUserId || !config.qaCaseId || account.user?.id !== config.qaUserId || !account.ready || account.statusState !== "loaded" ||
        account.status?.userId !== config.qaUserId || !account.hasProAccess || !account.status.pro || account.status.generations.remaining !== 1 ||
        repository.scope.owner.kind !== "account" || repository.scope.owner.userId !== config.qaUserId || !current.ready || current.testMode || current.effectiveResolution !== "1K" || current.reference || current.caseId !== config.qaCaseId || !photo) {
        return { passed: false, code: "qa_authenticated_fixture_not_ready", providerCalls: 0 };
      }
      const io = await localIo(config.runId), accessToken = await account.getAccessToken();
      if (!accessToken) return { passed: false, code: "qa_session_missing", providerCalls: 0 };
      const before = await fetchAccountStatus(accessToken);
      const consent: AiProcessingConsent = { version: AI_CONSENT_VERSION, photoFingerprint: await fingerprintPhotoForConsent(photo.dataUrl), confirmedAt: Date.now() };
      const uploadAuthority = { version: DOCUMENT_VERSIONS.upload_authority, confirmedAt: Date.now() };
      await account.recordConsent({ type: "upload_authority", version: uploadAuthority.version, caseId: config.qaCaseId }, { strict: true });
      const draft: SmileCase = { caseId: config.qaCaseId, photo, settings: structuredClone(config.settings), uploadAuthority, aiConsent: consent,
        result: null, variants: [], screen: "design", testMode: false, resolution: "1K", reference: null, patientName: "Authorised QA" };
      await repository.persistCase(draft);
      const controls = await options(config, config.requestId, "live");
      let result: GenerationResult | undefined;
      try {
        result = await current.requestPreview(photo, config.settings, new AbortController(), consent.version, undefined, controls.qa);
        if (result.mode !== "live" || await hashImage(result.image) === await hashImage(photo.dataUrl)) throw new Error("qa_unchanged_or_mock_output");
        await repository.persistCase({ ...draft, result, screen: "preview" });
        await repository.recordVisualisation({ id: result.variationId, caseId: config.qaCaseId, patientName: "Authorised QA", createdAt: Date.now(), mode: "live",
          label: "Authorised combined-treatment QA", summary: "Whitening + layered composite + alignment", thumb: await thumbnail(result.image) },
        { id: result.variationId, image: result.image, originalImage: photo.dataUrl, preferences: result.preferences ?? { settings: config.settings, testMode: false }, aiConsent: consent, generation: result.generation });
        const finalHash = await hashImage(result.image), reopened = await repository.readPresentationMedia(result.variationId);
        const savedSameImage = Boolean(reopened?.image && await hashImage(reopened.image) === finalHash);
        await io.write("accepted-version.json", { caseId: config.qaCaseId, versionId: result.variationId, finalSha256: finalHash, sourceSha256: config.sourceSha256 });
        bindings.displayResult(result);
        return { ...controls.report(), passed: savedSameImage, finalSha256: finalHash, savedSameImage };
      } catch {
        const evidence = await getLocalQaCapture().verifyEvidence(config.requestId);
        return { ...controls.report(), passed: false, code: result ? "qa_save_or_delivery_failed" : "qa_generation_or_validation_failed",
          rawSha256: evidence.files.raw?.sha256, normalizedSha256: evidence.files.normalized?.sha256 };
      } finally {
        const after = await fetchAccountStatus(accessToken).catch(() => null);
        await io.write("allowance-receipt.json", { requestId: config.requestId, before: before.generations, after: after?.generations ?? null, afterAcknowledged: Boolean(after), retries: 0 });
      }
    },
    replay: async (config, file, raw) => {
      if (!config.replayRunId || !config.replayRequestId) return { passed: false, code: "qa_replay_ids_missing", providerCalls: 0 };
      const photo = await preparePhoto(file), capture = createNativeQaCaptureForRun(config.replayRunId, "offline-self-test");
      await capture.register(file, photo.dataUrl);
      const controls = await options(config, config.replayRequestId, "replay", capture, raw);
      let result: GenerationResult | undefined;
      try { result = await bindings.current().requestPreview(photo, config.settings, new AbortController(), AI_CONSENT_VERSION, undefined, controls.qa); }
      catch { /* A genuine validation rejection is retained as the replay outcome. */ }
      const evidence = await capture.verifyEvidence(config.replayRequestId);
      await (await localIo(config.runId)).write("replay-evidence.json", evidence);
      return { ...controls.report(), passed: Boolean(result), rawSha256: evidence.files.raw?.sha256, normalizedSha256: evidence.files.normalized?.sha256,
        finalSha256: evidence.files.final?.sha256, providerCalls: 0 };
    },
    verifySaved: async config => {
      const current = bindings.current();
      if (!config.qaUserId || current.account.user?.id !== config.qaUserId || !config.qaCaseId) return { passed: false, code: "qa_account_mismatch", providerCalls: 0 };
      const accepted = await (await localIo(config.runId)).read("accepted-version.json"), draft = await current.repository.reopenCase(config.qaCaseId);
      const media = await current.repository.readPresentationMedia(accepted.versionId);
      const reopenedSameImage = Boolean(draft.result?.image && media?.image && await hashImage(draft.result.image) === accepted.finalSha256 && await hashImage(media.image) === accepted.finalSha256);
      if (reopenedSameImage) { bindings.restoreWorkingCase?.(draft); bindings.displayResult(draft.result!); }
      return { passed: reopenedSameImage, reopenedSameImage, finalSha256: accepted.finalSha256, providerCalls: 0 };
    },
  };
}
