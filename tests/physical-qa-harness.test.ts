import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/lib/types";
import { boundedPhysicalQaResult, capturePreflightPassed, validatePhysicalQaConfig } from "../src/services/ai/physicalQaHarness";

const runId = "398e3215-af9e-4a67-838f-ea1e45a6fa1e";
const hash = "a".repeat(64);
const config = () => ({ version: 1, runId, selfTestRunId: "d7df3e1f-a30a-48d9-8898-ae422c119357", selfTestRequestId: "07b843d1-7a58-4303-bf86-dee105b767a1", requestId: "b7320933-34b6-43d4-875d-2b9402dbb767", sourceSha256: hash,
  provenance: "owner-authorised-test-photo", sourceName: "IMG_3291.jpg", resolution: "1K", settings: { ...defaultSettings, teeth: 8, selectedTeeth: [14,13,12,11,21,22,23,24], treatment: "Layered composite", whitening: true,
    alignment: { arches: "Both" }, shape: "Square", character: "Balanced", currentShade: "A3", currentShadeSource: "clinician", targetShade: "Bleach", texture: "Natural", intensity: 67, smileArc: "Preserve existing", shotType: "Full face", libraryStyle: false, notes: "" } });

test("physical capture accepts only the approved immutable combined-treatment fixture", () => {
  const supplied = config(); const verified = validatePhysicalQaConfig(supplied, runId, hash);
  supplied.settings.intensity = 12;
  assert.equal(verified.settings.intensity, 67);
  assert.throws(() => validatePhysicalQaConfig(config(), runId, "b".repeat(64)), /not_authorised/);
  assert.throws(() => validatePhysicalQaConfig({ ...config(), provenance: "synthetic" }, runId, hash), /not_authorised/);
  assert.throws(() => validatePhysicalQaConfig({ ...config(), selfTestRunId: runId }, runId, hash), /not_authorised/);
});

test("physical capture rejects changed scope and added provider references before generation", () => {
  for (const patch of [{ selectedTeeth: [13,12,11,21,22,23] }, { alignment: { arches: "Upper" } }, { alignment: { arches: "Both", only: true } }, { libraryStyle: true }, { targetShade: "Whiten" }, { toothPlans: [{ tooth: 11, intent: "Auto", condition: "Natural" }] }, { notes: "unapproved request content" }]) {
    const fixture = config(); Object.assign(fixture.settings, patch);
    assert.throws(() => validatePhysicalQaConfig(fixture, runId, hash), /not_authorised/);
  }
});

test("one paid invocation remains blocked until every capture preflight proof is present", () => {
  const complete = { passed: true, captureEnabled: true, writesReadBack: true, rawBeforeValidation: true, forcedValidationRejected: true, rawSurvived: true, liveClaimUntouched: true };
  assert.equal(capturePreflightPassed(complete), true);
  for (const key of Object.keys(complete)) assert.equal(capturePreflightPassed({ ...complete, [key]: false }), false, key);
});

test("private harness receipt excludes credential and image contents and bounds diagnostics", () => {
  const result = boundedPhysicalQaResult({ passed: false, code: "generated_landmarks_missing", sourceSha256: hash, sourceLandmarks: 478, generatedLandmarks: 0,
    access_token: "secret", image: "data:image/jpeg;base64,private", error: "patient detail", firstRejection: "a".repeat(100), providerCalls: -1 } as never);
  assert.deepEqual(result, { passed: false, code: "generated_landmarks_missing", sourceSha256: hash, sourceLandmarks: 478, generatedLandmarks: 0 });
});
