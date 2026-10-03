import test from "node:test";
import assert from "node:assert/strict";
import * as geometry from "../src/lib/face/geometry";

test("protected-region validation catches changed skin while permitting dental edits", () => {
  const measure = (geometry as unknown as { measureProtectedRegionChange: (a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, m: geometry.Mask) => { changedPixels: number; meanDifference: number; maxDifference: number; protectedPixels: number } }).measureProtectedRegionChange;
  assert.equal(typeof measure, "function", "protected-region metric must be available");
  const original = new Uint8ClampedArray(4 * 4 * 4).fill(120);
  const edited = new Uint8ClampedArray(original); edited.fill(230);
  const mask: geometry.Mask = { x0: 1, y0: 1, width: 2, height: 2, alpha: new Float32Array([1, .5, 1, 0]) };
  const final = geometry.compositeMasked(original, edited, 4, mask);
  assert.deepEqual(measure(original, final, 4, mask), { changedPixels: 0, meanDifference: 0, maxDifference: 0, protectedPixels: 13 });
  final[0] += 10;
  const changed = measure(original, final, 4, mask);
  assert.equal(changed.changedPixels, 1); assert.equal(changed.maxDifference, 10);
  assert.ok(changed.meanDifference > 0);
  assert.throws(() => measure(original, new Uint8ClampedArray(2), 4, mask));
});

test("uniform mouth output is detected independently of correctly preserved exterior pixels", () => {
  const measure = (geometry as unknown as { editableRegionRange: (a: Uint8ClampedArray, w: number, m: geometry.Mask) => number | null }).editableRegionRange;
  assert.equal(typeof measure, "function");
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(127);
  const mask: geometry.Mask = { x0: 1, y0: 1, width: 2, height: 2, alpha: new Float32Array([1,1,1,1]) };
  pixels[0] = 255; assert.equal(measure(pixels, 4, mask), 0, "skin/background variation cannot rescue a blank mouth");
  pixels[(1*4+1)*4] = 150; assert.equal(measure(pixels, 4, mask), 23);
  assert.equal(measure(pixels, 4, { ...mask, alpha: new Float32Array(4) }), null);
});
