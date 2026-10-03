import test from "node:test";
import assert from "node:assert/strict";
import { chooseFullArch } from "../src/lib/fullArch";
import { defaultSettings, type SmileSettings } from "../src/lib/types";
import { generationSchema, settingsSchema } from "../src/lib/generation/schema";
import { normalizeGenerationContract } from "../src/lib/generation/contract";

const legacy = (): SmileSettings => ({ ...defaultSettings, treatmentMode: "full_arch", fullArch: { arch: "lower", restorationType: "provisional", prostheticGingiva: "include" } });
test("All-on-X selection uses both arches and zirconia despite remembered legacy options", () => {
  for (const saved of [defaultSettings, legacy()]) {
    const selected = chooseFullArch(saved);
    assert.equal(selected.fullArch?.arch, "both");
    assert.equal(selected.fullArch?.restorationType, "zirconia");
    assert.equal(selected.alignment, undefined);
  }
});
test("stale All-on-X requests use both zirconia while historical settings remain unchanged", () => {
  const saved = legacy();
  const request = generationSchema.parse({ originalImage: "data:image/jpeg;base64,/9j/", settings: saved });
  assert.deepEqual(request.settings.fullArch, { arch: "both", restorationType: "zirconia", prostheticGingiva: "include" });
  assert.deepEqual(normalizeGenerationContract(saved).fullArch, { arch: "both", restorationType: "zirconia", prostheticGingiva: "include" });
  assert.deepEqual(settingsSchema.parse(saved).fullArch, { arch: "lower", restorationType: "provisional", prostheticGingiva: "include" });
  assert.deepEqual(saved.fullArch, { arch: "lower", restorationType: "provisional", prostheticGingiva: "include" });
});
