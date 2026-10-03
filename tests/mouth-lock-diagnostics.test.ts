import test from "node:test";
import assert from "node:assert/strict";
import { lockFaceOutsideLips } from "../src/lib/face/mouthLock";
import { clearFaceAnalysisCache, primeFaceAnalysis } from "../src/lib/face/landmarks";
import { INNER_LIP, type Point } from "../src/lib/face/geometry";
import { safeGenerationDiagnostic } from "../src/services/ai/generationDiagnostics";

// Exercise the real lock and diagnostic allowlist. Only browser decode/canvas
// boundaries are substituted so their failures can be reproduced in Node.
test("mouth protection preserves the specific failure without leaking image/error contents", async (t) => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    clearFaceAnalysisCache();
    for (const [key, descriptor] of [["Image", originalImage], ["document", originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const points: Point[] = Array.from({ length: 478 }, (_, i) => [20 + i % 40, 20 + Math.floor(i / 40)]);
  points[61] = [20, 60]; points[291] = [80, 60];
  INNER_LIP.forEach((index, i) => {
    const angle = i / INNER_LIP.length * 2 * Math.PI;
    points[index] = [50 + 28 * Math.cos(angle), 60 + 8 * Math.sin(angle)];
  });
  for (const scenario of [
    { mode: "decode", want: "mouth_image_decode_failed" },
    { mode: "alignment", want: "mouth_alignment_rejected" },
    { mode: "canvas", want: "mouth_canvas_unavailable" },
    { mode: "pixels", want: "mouth_composite_failed" },
    { mode: "encode", want: "mouth_encoding_failed" },
  ]) {
    clearFaceAnalysisCache();
    primeFaceAnalysis("original-private-image", points);
    primeFaceAnalysis("generated-private-image", scenario.mode === "alignment" ? [] : points);
    class ImageBoundary {
      naturalWidth = 100; naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => scenario.mode === "decode" ? this.onerror?.() : this.onload?.());
      }
    }
    Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageBoundary });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      createElement: () => ({
        getContext: () => scenario.mode === "canvas" ? null : {
          drawImage() {}, setTransform() {}, putImageData() {},
          getImageData() {
            if (scenario.mode === "pixels") throw new Error("private browser error");
            return { data: new Uint8ClampedArray(100 * 100 * 4) };
          },
        },
        toDataURL() { throw new Error("private encoder error"); },
      }),
    } });
    const result = await lockFaceOutsideLips("original-private-image", "generated-private-image");
    assert.equal(result.locked, false, scenario.mode);
    assert.equal(result.image, "generated-private-image", "diagnostics must not alter or substitute output");
    const reason = (result as typeof result & { failureReason?: string }).failureReason;
    assert.equal(reason, scenario.want, scenario.mode);
    const safe = safeGenerationDiagnostic({
      requestId: "cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19", timestamp: 1,
      generationPath: "standard", selectedToothCount: 8, sourceWidth: 100,
      sourceHeight: 100, serverStatus: 200, stage: "mouth_composite", outcome: "failed", errorCode: reason,
    });
    assert.equal(safe?.errorCode, scenario.want);
    assert.doesNotMatch(JSON.stringify(safe), /private|image\/|base64/);
  }
});
