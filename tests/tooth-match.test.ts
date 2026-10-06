import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/lib/types";
import { settingsSchema } from "../src/lib/generation/schema";
import { generationUnavailable } from "../src/lib/generation/availability";
import { isNoChangeDesign } from "../src/lib/generation/designPlan";
import { newGuide, type SmileGuideShape } from "../src/lib/smileDesign/frame";
import { isToothMatch, keepToothRegion, matchSummary, matchWhitens, partnerOf, toothLabel, toothRegion, withToothMatch } from "../src/lib/smileDesign/toothMatch";
import { buildCanonicalPrompt } from "../src/lib/generation/contract";

test("teeth are named as clinicians say them, and each has a partner", () => {
  assert.deepEqual([11, 12, 13, 21, 22, 23].map(toothLabel), ["UR1", "UR2", "UR3", "UL1", "UL2", "UL3"]);
  assert.equal(partnerOf(21), 11);
  assert.equal(partnerOf(13), 23);
  assert.equal(matchSummary({ tooth: 21, missing: false }), "UL1 rebuilt to match UR1");
  assert.equal(matchSummary({ tooth: 22, missing: true }), "Missing UL2 added to match UR2");
});

test("designing one tooth is a valid design, allowed without the older single-tooth switch", () => {
  const s = withToothMatch(defaultSettings, { tooth: 21, missing: false });
  assert.ok(settingsSchema.safeParse(s).success);
  assert.deepEqual(s.selectedTeeth, [21]);
  assert.equal(generationUnavailable(s, { singleTooth: false, alignment: true, fullArch: true }), null);
  assert.equal(isNoChangeDesign({ ...s, targetShade: "The same", designIntent: "Shade only" }), false);
  assert.equal(isToothMatch(s), true);
  assert.ok(settingsSchema.safeParse(withToothMatch(defaultSettings, { tooth: 22, missing: true })).success);
  assert.match(generationUnavailable({ ...s, alignment: { arches: "Upper" } })!, /can’t be combined/);
  assert.equal(isToothMatch({ ...s, treatment: "Whitening" }), false);
});

// A level synthetic mouth: the guide's origin at (200, 100), half a mouth width 150 px.
const W = 400, H = 200, HW = 150, CX = 200, CY = 100;
const SHAPE: SmileGuideShape = {
  gum: Array(41).fill(-0.2), edge: Array(41).fill(0.25), span: [-1, 1], measured: true,
  divisions: [-0.54, -0.41, -0.24, 0, 0.24, 0.41, 0.54], teeth: Array.from({ length: 6 }, () => [-0.2, 0.25] as [number, number]),
};
const guide = newGuide({ cx: CX, cy: CY, halfWidth: HW, angle: 0 }, SHAPE);
const at = (a: Float32Array, x: number, y: number) => a[y * W + x];

test("the tooth's region covers its own space, not its neighbours or the lips", () => {
  const region = toothRegion(W, H, guide, { tooth: 21, missing: false }, null);
  // UL1 runs from the midline (x 200) to x 236; its crown from y 70 to y 137.
  assert.equal(at(region, 218, 105), 1);
  assert.equal(at(region, 182, 105), 0); // UR1
  assert.equal(at(region, 260, 105), 0); // UL2
  assert.equal(at(region, 218, 40), 0);  // above the gum line
  const opening = new Uint8Array(W * H);
  for (let y = 80; y < H; y++) for (let x = 0; x < W; x++) opening[y * W + x] = 1;
  assert.equal(at(toothRegion(W, H, guide, { tooth: 21, missing: false }, opening), 218, 75), 0);
  // A missing tooth's space reaches up to the lip.
  assert.ok(at(toothRegion(W, H, guide, { tooth: 21, missing: true }, null), 218, 62) > 0.9);
  // A chipped tooth may regain its partner's length.
  const short = { ...guide, shape: { ...SHAPE, teeth: SHAPE.teeth.map((t, i) => (i === 3 ? [-0.2, 0.1] : t) as [number, number]) } };
  assert.equal(at(toothRegion(W, H, short, { tooth: 21, missing: false }, null), 218, 130), 1);
});

test("only the tooth's region is taken from the result", () => {
  const original = new Uint8ClampedArray(W * H * 4).fill(50), result = new Uint8ClampedArray(W * H * 4).fill(220);
  const out = keepToothRegion(original, result, toothRegion(W, H, guide, { tooth: 21, missing: true }, null));
  assert.equal(out[(105 * W + 218) * 4], 220);
  assert.equal(out[(105 * W + 182) * 4], 50);
  assert.equal(out[(105 * W + 300) * 4], 50);
});

test("the one-tooth prompt changes only that tooth, matched to its partner", () => {
  const prompt = buildCanonicalPrompt(withToothMatch({ ...defaultSettings, targetShade: "Whiten" }, { tooth: 21, missing: false }), false, undefined, 0, undefined, true);
  assert.match(prompt, /only UL1 changes/);
  assert.match(prompt, /mirror image of FDI 11 \(UR1\)/);
  assert.match(prompt, /restoring any lost length/);
  assert.match(prompt, /Do not whiten or brighten/);
  assert.match(prompt, /White marks UL1's space/);
  assert.doesNotMatch(prompt, /Never add or remove teeth/);
  const missing = buildCanonicalPrompt(withToothMatch(defaultSettings, { tooth: 22, missing: true }));
  assert.match(missing, /It is missing: add one natural lateral incisor in its empty space/);
  assert.match(missing, /between FDI 21 \(UL1\) and FDI 23 \(UL3\)/);
  assert.equal(matchWhitens(withToothMatch({ ...defaultSettings, targetShade: "Whiten" }, { tooth: 22, missing: true })), true);
});
