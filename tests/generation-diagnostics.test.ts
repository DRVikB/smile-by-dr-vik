import test from "node:test";
import assert from "node:assert/strict";
import { safeGenerationDiagnostic, type GenerationDiagnostic } from "../src/services/ai/generationDiagnostics";
import { generateSmileImage } from "../src/services/ai/smileImageService";
import { defaultSettings } from "../src/lib/types";
import type { ProviderDiagnostic } from "../src/lib/generation/providerDiagnostics";

const diagnostic: GenerationDiagnostic = {
  requestId: "cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19", timestamp: 1790960400000,
  generationPath: "single_tooth", selectedToothCount: 1,
  sourceWidth: 1320, sourceHeight: 2048, requestWidth: 1365, requestHeight: 2048,
  serverStatus: 200, stage: "tooth_composite", outcome: "failed", errorCode: "stage_failed",
};

test("device QA records discard patient content and arbitrary provider errors", () => {
  const sensitive = { ...diagnostic, originalImage: "data:image/png;base64,PRIVATE", settings: { notes: "private clinical notes" }, caseId: "patient-id", patientName: "Private name", token: "secret", errorCode: "private raw upstream error" };
  const safe = safeGenerationDiagnostic(sensitive);
  assert.deepEqual(safe, diagnostic);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|private|secret|patient-id/);
  assert.equal(safeGenerationDiagnostic({ ...diagnostic, requestId: "private@example.com" }), null);
  assert.equal(safeGenerationDiagnostic({ ...diagnostic, sourceWidth: Infinity }), null);
  assert.equal(safeGenerationDiagnostic({ ...diagnostic, generationPath: "clinical notes" as GenerationDiagnostic["generationPath"] }), null);
  assert.equal(safeGenerationDiagnostic({ ...diagnostic, serverStatus: NaN })?.serverStatus, null);
});

test("server failure diagnostics use the same request ID and preserve HTTP status", async () => {
  let status: number | undefined;
  await assert.rejects(generateSmileImage({ originalImage: "unused", resolution: "1K", settings: defaultSettings }, {
    requestId: diagnostic.requestId, online: () => true,
    onResponse: value => { status = value; },
    fetcher: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("X-Smile-Request-Id"), diagnostic.requestId);
      return Response.json({ code: "provider_no_image", error: "private upstream details" }, { status: 502 });
    },
  }), { code: "provider_no_image" });
  assert.equal(status, 502);
});

test("provider failure evidence reaches private QA, is sanitized and cannot cross request IDs", async () => {
  const providerDiagnostic: ProviderDiagnostic = { requestId: diagnostic.requestId, provider: "google", model: "gemini-3.1-flash-image", promptVersion: "2026-10-03-treatment-contract-v6", category: "text_only", httpStatus: 200, latencyMs: 34000, retryCount: 0, treatmentMode: "standard", selectedToothCount: 8, inputWidth: 1365, inputHeight: 2048, requestedWidth: null, requestedHeight: null, requestedAspectRatio: "2:3", requestedResolution: "1K", finishReasons: "NO_IMAGE", partCount: 1, textParts: 1, imagePartExisted: false };
  let received: ProviderDiagnostic | undefined;
  for (const requestId of [diagnostic.requestId, crypto.randomUUID()]) {
    received = undefined;
    await assert.rejects(generateSmileImage({ originalImage: "unused", resolution: "1K", settings: defaultSettings }, {
      requestId: diagnostic.requestId, online: () => true, onProviderDiagnostic: d => { received = d; },
      fetcher: async () => Response.json({ code: "provider_no_image", providerDiagnostic: { ...providerDiagnostic, requestId, rawText: "PRIVATE_TEXT", image: "PRIVATE_IMAGE" } }, { status: 502 }),
    }), { code: "provider_no_image" });
    if (requestId === diagnostic.requestId) {
      assert.deepEqual(received, providerDiagnostic);
      assert.deepEqual(safeGenerationDiagnostic({ ...diagnostic, providerDiagnostic: received })?.providerDiagnostic, providerDiagnostic);
    } else assert.equal(received, undefined);
    assert.doesNotMatch(JSON.stringify(received) ?? "", /PRIVATE/);
  }
});
