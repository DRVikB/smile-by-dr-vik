import test from "node:test";
import assert from "node:assert/strict";
import { labToRgb, rgbToLab, toothWeights, whiteningPlan, whitenPixels } from "../src/lib/whitening";
import { isOnDeviceWhitening } from "../src/lib/whiteningDevice";
import { defaultSettings } from "../src/lib/types";
import { chooseFullArch } from "../src/lib/fullArch";

// A synthetic 60×30 "mouth": red gum band on top, yellow teeth in the middle
// (one shadowed), dark mouth below. The whole image is the opening.
const W = 60, H = 30;
const GUM = [190, 90, 95], TOOTH = [222, 205, 160], SHADOWED = [150, 135, 100], DARK = [35, 20, 22];
function mouth(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y < 8 ? GUM : y < 22 ? (x >= 40 && x < 48 ? SHADOWED : TOOTH) : DARK;
    px.set([...c, 255], (y * W + x) * 4);
  }
  return px;
}
const at = (px: Uint8ClampedArray, x: number, y: number) => Array.from(px.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
const region = new Uint8Array(W * H).fill(1);

test("Lab conversion round-trips sRGB colours", () => {
  for (const c of [GUM, TOOTH, SHADOWED, DARK, [255, 255, 255], [0, 0, 0]]) {
    const back = labToRgb(...rgbToLab(c[0], c[1], c[2]));
    back.forEach((v, i) => assert.ok(Math.abs(v - c[i]) <= 1, `${c} -> ${back}`));
  }
});

test("teeth are found by hue and lightness; gums and the dark mouth are not", () => {
  const { weights } = toothWeights(mouth(), W, H, region);
  assert.ok(weights[15 * W + 20] > 0.9, "lit tooth");
  assert.ok(weights[15 * W + 44] > 0.6, "shadowed tooth");
  assert.ok(weights[3 * W + 20] < 0.05, "gum");
  assert.ok(weights[27 * W + 20] < 0.05, "dark mouth");
});

test("whitening lightens and de-yellows teeth only; outlines and every other pixel are unchanged", () => {
  const px = mouth();
  const { weights } = toothWeights(px, W, H, region);
  const plan = whiteningPlan(px, weights, "Whiten", 35)!;
  assert.ok(plan.lift > 0 && plan.yellow > 0);
  const out = whitenPixels(px, weights, plan);
  const [L0, , b0] = rgbToLab(...(at(px, 20, 15) as [number, number, number]));
  const [L1, , b1] = rgbToLab(...(at(out, 20, 15) as [number, number, number]));
  assert.ok(L1 > L0 && b1 < b0, `tooth L ${L0}->${L1}, b ${b0}->${b1}`);
  assert.deepEqual(at(out, 20, 3), GUM);
  assert.deepEqual(at(out, 20, 27), DARK);
  // A shadowed tooth keeps its depth: it stays darker than a lit tooth.
  assert.ok(rgbToLab(...(at(out, 44, 15) as [number, number, number]))[0] < L1);
});

test("stronger settings whiten more; 'The same' changes nothing; whitening never darkens", () => {
  const px = mouth();
  const { weights } = toothWeights(px, W, H, region);
  assert.equal(whiteningPlan(px, weights, "The same", 100), null);
  const soft = whiteningPlan(px, weights, "Whiten", 10)!, strong = whiteningPlan(px, weights, "Bleach", 90)!;
  assert.ok(strong.lift > soft.lift && strong.yellow > soft.yellow);
  // Already lighter than A1: no darkening, no added yellow.
  const a1 = whiteningPlan(px, weights, "A1", 100)!;
  assert.ok(a1.lift >= 0 && a1.yellow >= 0);
});

test("only colour-only whitening runs on the device", () => {
  assert.equal(isOnDeviceWhitening({ ...defaultSettings, treatment: "Whitening" }), true);
  assert.equal(isOnDeviceWhitening({ ...defaultSettings, treatment: "Porcelain", whitening: true }), false);
  assert.equal(isOnDeviceWhitening({ ...defaultSettings, treatment: "Whitening", alignment: { arches: "Both", only: false } }), false);
  assert.equal(isOnDeviceWhitening(chooseFullArch({ ...defaultSettings, treatment: "Whitening" })), false);
});
