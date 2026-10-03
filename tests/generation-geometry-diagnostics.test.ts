import test from "node:test";
import assert from "node:assert/strict";
import { safeGenerationDiagnostic } from "../src/services/ai/generationDiagnostics";
import type { GenerationDiagnostic } from "../src/services/ai/generationDiagnostics";
const base = { requestId: "cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19", timestamp: 1, generationPath: "standard", selectedToothCount: 6, sourceWidth: 1092, sourceHeight: 1440, serverStatus: 200, stage: "align", outcome: "running" } as const;
test("diagnostics retain the actual de-padding mapping without retaining images or arbitrary fields", () => {
  const geometry = { cropX: 0, cropY: 6.593406593406594, cropWidth: 896, cropHeight: 1186.8131868131868, finalWidth: 1092, finalHeight: 1440, scaleX: 1092/896, scaleY: 1440/1186.8131868131868 };
  const safe = safeGenerationDiagnostic({ ...base, geometry: { ...geometry, image: "patient-image", token: "credential" } } as unknown as GenerationDiagnostic);
  assert.deepEqual((safe as unknown as { geometry: unknown }).geometry, geometry);
  assert.doesNotMatch(JSON.stringify(safe), /patient-image|credential/);
  assert.equal((safeGenerationDiagnostic({ ...base, geometry: { ...geometry, cropY: NaN } } as unknown as GenerationDiagnostic) as unknown as { geometry?: unknown })?.geometry, undefined);
});
