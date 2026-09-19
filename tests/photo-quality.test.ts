import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhotoQuality, sharpnessScore, brightnessScore } from '../src/lib/photoQuality';

function solid(width: number, height: number, [r, g, b]: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function checkerboard(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = (x + y) % 2 === 0;
      const v = on ? 240 : 20;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function checkerboardRange(width: number, height: number, hi: number, lo: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (x + y) % 2 === 0 ? hi : lo;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

test('a perfectly flat image scores zero sharpness', () => {
  const flat = solid(40, 40, [128, 128, 128]);
  assert.equal(sharpnessScore(flat, 40, 40), 0);
});

test('a high-contrast checkerboard scores far higher than a flat image', () => {
  const flat = solid(40, 40, [128, 128, 128]);
  const sharp = checkerboard(40, 40);
  assert.ok(sharpnessScore(sharp, 40, 40) > sharpnessScore(flat, 40, 40) * 100);
});

test('brightnessScore reads mid-grey as roughly 128', () => {
  const mid = solid(20, 20, [128, 128, 128]);
  assert.ok(Math.abs(brightnessScore(mid, 20, 20) - 128) < 1);
});

test('assessPhotoQuality flags a flat, dark, uploaded photo as blurry and too dark', () => {
  const bad = solid(60, 60, [20, 20, 20]);
  const q = assessPhotoQuality(bad, 60, 60);
  assert.equal(q.blurry, true);
  assert.equal(q.tooDark, true);
  assert.equal(q.tooBright, false);
});

test('assessPhotoQuality flags an overexposed photo as too bright, not blurry if it still has edges', () => {
  // Same edge contrast as the sharp checkerboard above (gap of 55), just
  // shifted up near white, so it reads as bright without reading as flat.
  const brightChecker = checkerboardRange(60, 60, 255, 200);
  const q = assessPhotoQuality(brightChecker, 60, 60);
  assert.equal(q.tooBright, true);
  assert.equal(q.blurry, false);
});

test('assessPhotoQuality passes a sharp, well-lit photo clean', () => {
  // Midtone checkerboard: same edge contrast, centred around a normal
  // exposure instead of the near-black/near-white extremes above.
  const good = checkerboardRange(60, 60, 165, 110);
  const q = assessPhotoQuality(good, 60, 60);
  assert.equal(q.blurry, false);
  assert.equal(q.tooDark, false);
  assert.equal(q.tooBright, false);
});
