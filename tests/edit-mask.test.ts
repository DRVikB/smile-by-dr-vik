import test from "node:test";
import assert from "node:assert/strict";
import { compositeEditMask } from "../src/lib/editMask";

test("painted permissions keep gums/untreated pixels exactly original outside the mask before encoding", () => {
  const original = new Uint8ClampedArray([100, 30, 20, 255, 190, 180, 160, 255, 40, 50, 60, 255]);
  const edited = new Uint8ClampedArray([0, 0, 0, 255, 230, 220, 210, 255, 255, 255, 255, 255]);
  const mask = new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
  assert.deepEqual([...compositeEditMask(original, edited, mask)], [100, 30, 20, 255, 230, 220, 210, 255, 40, 50, 60, 255]);
  assert.deepEqual([...original], [100, 30, 20, 255, 190, 180, 160, 255, 40, 50, 60, 255]);
});

test("soft stroke edges blend only at painted alpha, not in a dilated area", () => {
  const o = new Uint8ClampedArray([0, 0, 0, 255]);
  const e = new Uint8ClampedArray([200, 100, 50, 255]);
  assert.deepEqual([...compositeEditMask(o, e, new Uint8ClampedArray([0, 0, 0, 128]))], [100, 50, 25, 255]);
  assert.throws(() => compositeEditMask(o, e, new Uint8ClampedArray(0)), /dimensions/);
});
