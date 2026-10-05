import test from "node:test";
import assert from "node:assert/strict";
import { guardUpperEdges } from "../src/lib/edgeGuard";

// A synthetic mouth: an opening of dark oral space, ivory upper teeth from the top
// of the opening down to `edge`, and (optionally) lower teeth from `lowerTop` down.
const W = 80, H = 60, TOP = 10, BOTTOM = 50;
const IVORY = [230, 215, 180], DARK = [40, 22, 20], SKIN = [200, 150, 130];
function mouth(edge: number, lowerTop?: number) {
  const px = new Uint8ClampedArray(W * H * 4), opening = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = y >= TOP && y <= BOTTOM && x >= 5 && x < W - 5;
    if (inside) opening[i] = 1;
    const c = !inside ? SKIN : y <= edge ? IVORY : lowerTop !== undefined && y >= lowerTop ? IVORY : DARK;
    px.set([...c, 255], i * 4);
  }
  return { px, opening };
}
const at = (px: Uint8ClampedArray, x: number, y: number) => [...px.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];

test("edge guard: upper teeth that came out longer are trimmed back to the original edge", () => {
  const original = mouth(30), result = mouth(36);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "trimmed");
  assert.equal(r.extraPx, 6);
  // Tolerance is max(2 px, 5% of the 20 px tooth): rows up to 32 keep the new teeth, row 34 onwards is the original dark space.
  assert.deepEqual(at(r.pixels, 40, 31), IVORY);
  assert.deepEqual(at(r.pixels, 40, 34), DARK);
  assert.deepEqual(at(r.pixels, 40, 36), DARK);
  // Outside the checked span (the corners of the mouth) nothing is touched.
  assert.deepEqual(at(r.pixels, 7, 36), IVORY);
});

test("edge guard: a result within tolerance is left exactly as it was", () => {
  const original = mouth(30), result = mouth(31);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "within-tolerance");
  assert.equal(r.pixels, result.px);
});

test("edge guard: teeth that can't be separated from the lower teeth are never trimmed", () => {
  // Upper teeth meet the lower teeth: no gap, so the upper edge can't be measured.
  const original = mouth(30, 31), result = mouth(36, 37);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.trimmed, false);
  assert.equal(r.reason, "unmeasurable");
});

test("edge guard: an implausibly large difference is not 'corrected'", () => {
  const original = mouth(22), result = mouth(40);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "implausible");
  assert.equal(r.pixels, result.px);
});
