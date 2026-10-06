import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, upperTeeth } from "../src/lib/types";
import { settingsSchema } from "../src/lib/generation/schema";
import { generationUnavailable } from "../src/lib/generation/availability";
import { isNoChangeDesign } from "../src/lib/generation/designPlan";
import { isOnDeviceWhitening } from "../src/lib/whiteningDevice";
import { goalNeedsStudio, QUICK_GOALS, quickSmileSettings } from "../src/lib/quickSmile";

const features = { singleTooth: false, alignment: true, fullArch: true };
// A clinician's earlier one-tooth plan and kept shade must not leak into a quick design.
const earlier = { ...defaultSettings, targetShade: "The same" as const, toothMatch: { tooth: 22 as const, missing: true }, selectedTeeth: [22], toothPlans: [{ tooth: 22, intent: "Close gaps" as const, condition: "Natural" as const }], shape: "Square" as const };

test("every Quick Smile goal is a valid, generatable design", () => {
  for (const { goal } of QUICK_GOALS) {
    const s = quickSmileSettings(goal, earlier);
    assert.ok(settingsSchema.safeParse(s).success, goal);
    assert.equal(generationUnavailable(s, features), null, goal);
    assert.equal(isNoChangeDesign(s), false, goal);
  }
});

test("each goal sets its own treatment and keeps the clinician's style", () => {
  const whiten = quickSmileSettings("whiten", earlier);
  assert.equal(isOnDeviceWhitening(whiten), true);
  assert.equal(whiten.targetShade, "Whiten");
  assert.equal(whiten.toothMatch, undefined);
  const veneers = quickSmileSettings("veneers", earlier);
  assert.deepEqual(veneers.selectedTeeth, upperTeeth[8]);
  assert.equal(veneers.treatment, defaultSettings.treatment);
  assert.equal(veneers.shape, "Square");
  assert.equal(quickSmileSettings("straighten", earlier).alignment?.only, true);
  assert.equal(quickSmileSettings("full-arch", earlier).treatmentMode, "full_arch");
  const one = quickSmileSettings("one-tooth", earlier);
  assert.deepEqual(one.toothMatch, { tooth: 21, missing: false });
  assert.equal(goalNeedsStudio("one-tooth"), true);
  assert.equal(goalNeedsStudio("veneers"), false);
});
