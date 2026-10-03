import test from "node:test";
import assert from "node:assert/strict";
import { safeAlignmentDiagnostic } from "../src/lib/face/alignmentDiagnostic";

test("face detection separates model, decode, empty and invalid results without returning exceptions", async () => {
  const module = await import("../src/lib/face/detectionResult").catch(() => null);
  assert.ok(module, "bounded face detection result is required");
  const points = Array.from({ length: 478 }, () => [1, 2]);
  for (const [kind, expected] of [["load", "generated_face_model_failed"], ["decode", "generated_image_decode_failed"], ["detect", "generated_face_model_failed"], ["empty", "generated_face_not_found"], ["missing", "generated_landmarks_missing"], ["invalid", "generated_landmarks_invalid"], ["nan", "generated_landmarks_invalid"]] as const) {
    let closed = false;
    const result: { points: number[][] | null; failure?: string } = await module.runFaceDetection("data:image/png;base64,cHJpdmF0ZQ==", {
      load: async () => { if (kind === "load") throw Error("private model detail"); return true; },
      decode: async () => { if (kind === "decode") throw Error("private pixels"); return { close() { closed = true; } }; },
      detect: () => { if (kind === "detect") throw Error("private inference detail"); return kind === "empty" ? [] : kind === "missing" ? undefined : kind === "invalid" ? [[1, 2]] : kind === "nan" ? points.map(() => [NaN, 2]) : points; },
    });
    assert.deepEqual(result, { points: null, failure: expected });
    assert.equal(closed, !["load", "decode"].includes(kind));
    assert.doesNotMatch(JSON.stringify(result), /private|data:image/);
  }
  const result = await module.runFaceDetection("synthetic", { load: async () => true, decode: async () => ({ close() {} }), detect: () => points });
  assert.deepEqual(result, { points });
});

test("face worker categories reach the caller and a worker crash remains distinct from no face", async () => {
  const { activateWorkspace } = await import("../src/lib/workspace");
  const { detectFaceDetailed, detectFace, clearFaceAnalysisCache } = await import("../src/lib/face/landmarks");
  const previous = globalThis.Worker;
  let failure = "generated_image_decode_failed", crash = false;
  class WorkerFixture {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate() {}
    postMessage(message: { id: number }) {
      queueMicrotask(() => crash ? this.onerror?.({} as ErrorEvent) : this.onmessage?.({ data: { id: message.id, result: { points: null, failure } } } as MessageEvent));
    }
  }
  Object.assign(globalThis, { Worker: WorkerFixture });
  try {
    activateWorkspace({ kind: "account", userId: "synthetic-diagnostic-test" });
    for (failure of ["generated_image_decode_failed", "generated_face_model_failed", "generated_face_not_found", "generated_landmarks_invalid", "generated_landmarks_missing"]) {
      assert.deepEqual(await detectFaceDetailed("synthetic"), { points: null, failure });
      assert.equal(await detectFace("synthetic"), null);
    }
    crash = true;
    assert.deepEqual(await detectFaceDetailed("synthetic"), { points: null, failure: "generated_face_worker_failed" });
  } finally { clearFaceAnalysisCache(); Object.assign(globalThis, { Worker: previous }); }
});

test("QA retains bounded generated-face failure and excludes all supplied image/error details", () => {
  for (const generatedFaceFailure of ["generated_face_not_found", "generated_image_decode_failed", "generated_face_worker_failed", "generated_face_model_failed", "generated_landmarks_invalid", "generated_landmarks_missing"]) {
    const safe = safeAlignmentDiagnostic({ rejection: "generated_landmarks_missing", generatedFaceFailure, sourceLandmarkCount: 478, generatedLandmarkCount: 0, image: "private", error: "private", landmarks: [[1,2]] });
    assert.equal((safe as unknown as { generatedFaceFailure: string }).generatedFaceFailure, generatedFaceFailure);
    assert.doesNotMatch(JSON.stringify(safe), /private|"landmarks"/);
    assert.equal(safe?.fittedScale, undefined);
  }
  assert.equal((safeAlignmentDiagnostic({ generatedFaceFailure: "private" }) as unknown as { generatedFaceFailure?: string } | undefined)?.generatedFaceFailure, undefined);
});

test("mouth lock reports the face-detection cause at its first missing-landmarks rejection", async () => {
  const { activateWorkspace } = await import("../src/lib/workspace");
  const { primeFaceAnalysis, clearFaceAnalysisCache } = await import("../src/lib/face/landmarks");
  const { lockFaceOutsideLips } = await import("../src/lib/face/mouthLock");
  const previousWorker = globalThis.Worker, previousImage = globalThis.Image;
  class ImageFixture { onload: (()=>void) | null = null; onerror: (()=>void) | null = null; naturalWidth=1092; naturalHeight=1440; set src(_src:string) { queueMicrotask(()=>this.onload?.()); } }
  class WorkerFixture {
    onmessage: ((event: MessageEvent) => void) | null = null; onerror=null; terminate() {}
    postMessage(message:{id:number}) { queueMicrotask(()=>this.onmessage?.({data:{id:message.id,result:{points:null,failure:"generated_image_decode_failed"}}} as MessageEvent)); }
  }
  Object.assign(globalThis,{Worker:WorkerFixture,Image:ImageFixture});
  try {
    activateWorkspace({kind:"account",userId:"mouth-diagnostic-fixture"});
    primeFaceAnalysis("original",Array.from({length:478},()=>[1,2]));
    let observed: unknown;
    const result = await lockFaceOutsideLips("original","returned", d=>observed=d);
    assert.equal(result.invalidAlignment,true);
    assert.equal(result.failureReason,"mouth_alignment_rejected");
    assert.deepEqual(observed,{rejection:"generated_landmarks_missing",sourceLandmarkCount:478,generatedLandmarkCount:0,generatedFaceFailure:"generated_image_decode_failed",sourceWidth:1092,sourceHeight:1440,generatedWidth:1092,generatedHeight:1440});
  } finally { clearFaceAnalysisCache(); Object.assign(globalThis,{Worker:previousWorker,Image:previousImage}); }
});
