import { test } from "node:test";
import assert from "node:assert/strict";
import { lipDisplay, lipGapRatio } from "../src/lib/face/lipDisplay";
import { buildImageEditPrompt } from "../src/lib/generation/imageEditPrompt";
import { buildSunburstPrompt } from "../src/lib/generation/contract";
import { settingsSchema } from "../src/lib/generation/schema";
import { defaultSettings, type SmileSettings } from "../src/lib/types";
import { chooseFullArch } from "../src/lib/fullArch";
import type { Point } from "../src/lib/face/geometry";

function face(gap: number, width = 100): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => [0, 0]);
  points[61] = [200, 400]; points[291] = [200 + width, 400];
  points[13] = [250, 400 - gap / 2]; points[14] = [250, 400 + gap / 2];
  return points;
}

test("lip display: a small gap between the inner lips is narrow, a wide smile is open", () => {
  assert.equal(lipGapRatio(face(12)), 0.12);
  assert.equal(lipDisplay(face(12)), "narrow");
  assert.equal(lipDisplay(face(30)), "open");
  assert.equal(lipDisplay(null), undefined);
  assert.equal(lipDisplay(face(10, 0)), undefined);
});

test("full arch always asks for a natural arch; a narrow opening adds the limited-display rule", () => {
  const fullArch = chooseFullArch({ ...defaultSettings }) as SmileSettings;
  const open = buildImageEditPrompt({ ...fullArch, lipDisplay: "open" });
  const narrow = buildImageEditPrompt({ ...fullArch, lipDisplay: "narrow" });
  assert.match(open, /FULL-ARCH ARCH FORM/);
  assert.match(open, /buccal corridors/);
  assert.doesNotMatch(open, /LIMITED DISPLAY/);
  assert.match(narrow, /LIMITED DISPLAY/);
  assert.match(narrow, /let the lips cover what does not fit/);
  assert.match(buildSunburstPrompt({ ...fullArch, lipDisplay: "narrow" }), /lips are only slightly apart/);
  // Never for veneers or close-ups.
  assert.doesNotMatch(buildImageEditPrompt({ ...defaultSettings, lipDisplay: "narrow" }), /LIMITED DISPLAY|ARCH FORM/);
  assert.doesNotMatch(buildImageEditPrompt({ ...fullArch, shotType: "Close-up", lipDisplay: "narrow" }), /LIMITED DISPLAY/);
});

test("the request accepts the measured lip display and nothing else", () => {
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, lipDisplay: "narrow" }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, lipDisplay: "closed" }).success, false);
});
