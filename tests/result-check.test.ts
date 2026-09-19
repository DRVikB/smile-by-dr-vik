import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResultScale } from '../src/lib/resultCheck';

const W = 400, H = 500;
const FRAMING = { x: 0.3, y: 0.54, width: 0.4, height: 0.15 };

function baseImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 200;
    data[i * 4 + 1] = 180;
    data[i * 4 + 2] = 170;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Paint a rectangle, in pixel coordinates, a different colour. */
function paint(data: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      data[i] = 250;
      data[i + 1] = 250;
      data[i + 2] = 245;
    }
  }
}

test('returns null when there is no framing to anchor against', () => {
  const img = baseImage();
  assert.equal(assessResultScale(img, img, W, H, undefined), null);
});

test('returns null when the buffers do not match', () => {
  const a = baseImage();
  const b = new Uint8ClampedArray(4);
  assert.equal(assessResultScale(a, b, W, H, FRAMING), null);
});

test('an unedited photo (no diff) reads as ok', () => {
  const img = baseImage();
  const result = assessResultScale(img, img, W, H, FRAMING);
  assert.deepEqual(result, { flag: 'ok', changedWidthRatio: 0 });
});

test('an edit confined to the guide box reads as ok', () => {
  const original = baseImage();
  const generated = baseImage();
  const bx0 = Math.round(FRAMING.x * W);
  const bx1 = Math.round((FRAMING.x + FRAMING.width) * W);
  const by0 = Math.round(FRAMING.y * H);
  const by1 = Math.round((FRAMING.y + FRAMING.height) * H);
  paint(generated, bx0, by0, bx1, by1);
  const result = assessResultScale(original, generated, W, H, FRAMING);
  assert.equal(result?.flag, 'ok');
  assert.ok(result!.changedWidthRatio <= 1.1);
});

test('an edit that grows well past the guide box is flagged', () => {
  const original = baseImage();
  const generated = baseImage();
  const bx0 = Math.round(FRAMING.x * W);
  const bx1 = Math.round((FRAMING.x + FRAMING.width) * W);
  const by0 = Math.round(FRAMING.y * H);
  const by1 = Math.round((FRAMING.y + FRAMING.height) * H);
  const grownWidth = (bx1 - bx0) * 2;
  const centreX = (bx0 + bx1) / 2;
  paint(generated, Math.round(centreX - grownWidth / 2), by0, Math.round(centreX + grownWidth / 2), by1);
  const result = assessResultScale(original, generated, W, H, FRAMING);
  assert.equal(result?.flag, 'grew');
  assert.ok(result!.changedWidthRatio > 1.35);
});

test('a handful of scattered noisy pixels does not widen the measured region', () => {
  const original = baseImage();
  const generated = baseImage();
  const bx0 = Math.round(FRAMING.x * W);
  const bx1 = Math.round((FRAMING.x + FRAMING.width) * W);
  const by0 = Math.round(FRAMING.y * H);
  const by1 = Math.round((FRAMING.y + FRAMING.height) * H);
  paint(generated, bx0, by0, bx1, by1);
  // A few stray far-away pixels, well outside the guide box.
  for (const [x, y] of [[5, 5], [390, 490], [10, 480], [380, 10]]) {
    const i = (y * W + x) * 4;
    generated[i] = 5;
    generated[i + 1] = 5;
    generated[i + 2] = 5;
  }
  const result = assessResultScale(original, generated, W, H, FRAMING);
  assert.equal(result?.flag, 'ok');
});

test('too little change to measure reads as ok rather than guessing', () => {
  const original = baseImage();
  const generated = baseImage();
  const i = (Math.round(FRAMING.y * H) * W + Math.round(FRAMING.x * W)) * 4;
  generated[i] = 240;
  const result = assessResultScale(original, generated, W, H, FRAMING);
  assert.deepEqual(result, { flag: 'ok', changedWidthRatio: 0 });
});
