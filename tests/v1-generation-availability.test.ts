import test from "node:test";
import assert from "node:assert/strict";
import { generateSmileImage } from "../src/services/ai/smileImageService";
import { defaultSettings } from "../src/lib/types";
import { updateToothPlan } from "../src/lib/teeth";

for (const tooth of [11, 21, 12, 22, 13, 23]) {
  test(`V1 rejects FDI ${tooth} before network, allowance, or submission`, async () => {
    const settings = updateToothPlan({ ...defaultSettings, selectedTeeth: [], toothPlans: [] }, { tooth, condition: "Natural", intent: "Auto" });
    const before = structuredClone(settings);
    let submitted = false;
    await assert.rejects(generateSmileImage({ settings, resolution: "1K", originalImage: "synthetic" }, {
      online: () => true,
      onSubmitted: () => { submitted = true; },
      fetcher: async () => { throw new Error("Network must not be reached"); },
    }), { code: "mode_unavailable", message: "Single-tooth design is not available in this version." });
    assert.equal(submitted, false);
    assert.deepEqual(settings, before, "legacy design data is never rewritten by the release gate");
  });
}

test("Alignment and full arch are public shared-path modes; a stale single-tooth count does not gate alignment", async () => {
  const { generationUnavailable } = await import("../src/lib/generation/availability");
  const { chooseFullArch } = await import("../src/lib/fullArch");
  assert.equal(generationUnavailable({ ...defaultSettings, alignment: { arches: "Upper", only: true } }), null);
  assert.equal(generationUnavailable(chooseFullArch(defaultSettings)), null);
  const single = updateToothPlan({ ...defaultSettings, selectedTeeth: [], toothPlans: [] }, { tooth: 11, condition: "Natural", intent: "Auto" });
  assert.equal(generationUnavailable({ ...single, alignment: { arches: "Both", only: true } }), null);
});
