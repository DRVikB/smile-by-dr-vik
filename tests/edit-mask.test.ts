import test from "node:test";
import assert from "node:assert/strict";
import { compositeEditMask, editMaskFeather, featherEditMask } from "../src/lib/editMask";

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

test("a painted area fades in from its edge and never spreads past it", () => {
  const w = 21, h = 1, mask = new Uint8ClampedArray(w * h * 4);
  for (let x = 5; x <= 15; x++) mask[x * 4 + 3] = 255;
  const faded = featherEditMask(mask, w, h, 4);
  const alpha = (x: number) => faded[x * 4 + 3];
  for (const x of [0, 4, 16, 20]) assert.equal(alpha(x), 0);
  assert.ok(alpha(5) > 0 && alpha(5) < 64);
  assert.ok(alpha(5) < alpha(6) && alpha(6) < alpha(7) && alpha(7) < alpha(8));
  assert.equal(alpha(10), 255);
  assert.equal(alpha(5), alpha(15));
  assert.deepEqual([...faded].filter((_, i) => i % 4 !== 3), [...mask].filter((_, i) => i % 4 !== 3));
});

test("the fade is a small share of the painted width, and nothing paints nothing", () => {
  const w = 200, h = 2, mask = new Uint8ClampedArray(w * h * 4);
  assert.equal(editMaskFeather(mask, w, h), 0);
  for (let x = 50; x < 150; x++) mask[x * 4 + 3] = 255;
  assert.equal(editMaskFeather(mask, w, h), 3);
  for (let x = 0; x < w; x++) mask[x * 4 + 3] = 255;
  assert.equal(editMaskFeather(mask, w, h), 6);
  assert.deepEqual([...featherEditMask(mask, w, h, 0)], [...mask]);
});

test("a tooth lengthened past the painted edge keeps its new edge; lips and unchanged pixels stay restored", async () => {
  const { growToothEdges } = await import("../src/lib/editMask");
  const w = 60, h = 40, n = w * h;
  const original = new Uint8ClampedArray(n * 4), edited = new Uint8ClampedArray(n * 4), mask = new Uint8ClampedArray(n * 4);
  const set = (a: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number) => { const i = (y * w + x) * 4; a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { set(original, x, y, 40, 20, 20); set(edited, x, y, 40, 20, 20); }
  // Painted teeth: rows 10–19, columns 10–49.
  for (let y = 10; y < 20; y++) for (let x = 10; x < 50; x++) { mask[(y * w + x) * 4 + 3] = 255; set(edited, x, y, 235, 228, 215); }
  // The design lengthened the teeth by two rows; a red lip lies below that.
  for (let y = 20; y < 22; y++) for (let x = 10; x < 50; x++) set(edited, x, y, 235, 228, 215);
  for (let x = 10; x < 50; x++) set(edited, x, 22, 200, 90, 100);
  // A light patch beyond the band, not joined to the teeth.
  for (let x = 10; x < 50; x++) set(edited, x, 35, 235, 228, 215);
  const { mask: grown, added } = growToothEdges(original, edited, mask, w, h);
  const alpha = (x: number, y: number) => grown[(y * w + x) * 4 + 3];
  assert.equal(added, 80);
  assert.equal(alpha(30, 21), 255);
  assert.equal(alpha(30, 22), 0);
  assert.equal(alpha(30, 35), 0);
  assert.equal(alpha(5, 15), 0);
});
