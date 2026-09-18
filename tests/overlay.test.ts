import test from 'node:test';
import assert from 'node:assert/strict';
import { dilate, erode, keepLargeRegions, sobel } from '../src/lib/overlay';

test('dilate grows a mask by one pixel per pass, without wrapping rows', () => {
  const w = 5, h = 5;
  const mask = new Uint8Array(w * h);
  mask[2 * w + 2] = 1; // centre
  const once = dilate(mask, w, h, 1);
  assert.deepEqual(
    Array.from(once).reduce<number[]>((a, v, i) => (v ? [...a, i] : a), []),
    [7, 11, 12, 13, 17],
  );
  // Two passes reach two pixels out, still a diamond.
  assert.equal(dilate(mask, w, h, 2).reduce((a, v) => a + v, 0), 13);
  // A pixel at the right edge must not bleed onto the next row's left edge.
  const edge = new Uint8Array(w * h);
  edge[1 * w + (w - 1)] = 1;
  const grown = dilate(edge, w, h, 1);
  assert.equal(grown[2 * w + 0], 0, 'wrapped onto the next row');
  assert.equal(grown[1 * w + (w - 2)], 1);
});

test('dilate with radius 0 is a no-op, and an empty mask stays empty', () => {
  const mask = new Uint8Array(9);
  mask[4] = 1;
  assert.deepEqual(Array.from(dilate(mask, 3, 3, 0)), Array.from(mask));
  assert.equal(dilate(new Uint8Array(9), 3, 3, 3).reduce((a, v) => a + v, 0), 0);
});

test('sobel finds a vertical edge and ignores flat areas', () => {
  const w = 5, h = 5;
  const lum = new Float32Array(w * h);
  // Left half dark, right half bright: one vertical edge down the middle.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) lum[y * w + x] = x < 2 ? 0 : 255;
  const g = sobel(lum, w, h);
  assert.ok(g[2 * w + 2] > 100, 'no gradient at the edge');
  assert.equal(g[2 * w + 4], 0, 'border pixels are left at zero');
  assert.equal(g[2 * w + 1] > 0, true);

  const flat = sobel(new Float32Array(w * h).fill(120), w, h);
  assert.equal(flat.reduce((a, v) => a + v, 0), 0, 'flat image produced edges');
});

test('erode is the inverse of dilate for a solid block, and clears a thin line', () => {
  const w = 7, h = 7;
  const block = new Uint8Array(w * h);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) block[y * w + x] = 1;
  assert.equal(erode(block, w, h, 1).reduce((a, v) => a + v, 0), 1, 'a 3x3 block erodes to its centre');
  // A one-pixel-wide line — a hair strand — disappears entirely.
  const line = new Uint8Array(w * h);
  for (let y = 1; y < 6; y++) line[y * w + 3] = 1;
  assert.equal(erode(line, w, h, 1).reduce((a, v) => a + v, 0), 0);
});

test('keepLargeRegions keeps the smile and drops the speckle', () => {
  const w = 10, h = 10;
  const mask = new Uint8Array(w * h);
  // One 4x4 blob…
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++) mask[y * w + x] = 1;
  // …and two stray pixels far away.
  mask[8 * w + 8] = 1;
  mask[0 * w + 9] = 1;
  const kept = keepLargeRegions(mask, w, h, 10);
  assert.equal(kept.reduce((a, v) => a + v, 0), 16);
  assert.equal(kept[8 * w + 8], 0);
  assert.equal(kept[0 * w + 9], 0);
  // Diagonal-only neighbours are separate blobs, so neither survives alone.
  const diag = new Uint8Array(w * h);
  diag[2 * w + 2] = 1;
  diag[3 * w + 3] = 1;
  assert.equal(keepLargeRegions(diag, w, h, 2).reduce((a, v) => a + v, 0), 0);
});
