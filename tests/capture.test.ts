import test from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop, zoomedCrop } from '../src/lib/capture';

test('coverCrop centres a crop matching the box aspect inside the native frame', () => {
  // Video wider than the box: crop narrows, full height, centred horizontally.
  assert.deepEqual(coverCrop(1920, 1440, 3 / 4), { sx: 420, sy: 0, sw: 1080, sh: 1440 });
  // Video taller than the box: crop shortens, full width, centred vertically.
  assert.deepEqual(coverCrop(1080, 1920, 3 / 4), { sx: 0, sy: 240, sw: 1080, sh: 1440 });
  // Matching aspect: no cropping at all.
  assert.deepEqual(coverCrop(900, 1200, 3 / 4), { sx: 0, sy: 0, sw: 900, sh: 1200 });
});

test('zoomedCrop with no zoom matches the plain cover crop', () => {
  const box = { w: 300, h: 400 };
  assert.deepEqual(
    zoomedCrop(1920, 1440, box.w, box.h, { scale: 1, x: 0, y: 0 }),
    coverCrop(1920, 1440, box.w / box.h),
  );
});

test('zoomedCrop at 2x, centred, halves the exported width and height', () => {
  const box = { w: 300, h: 400 };
  const base = coverCrop(1920, 1440, box.w / box.h);
  const zoomed = zoomedCrop(1920, 1440, box.w, box.h, { scale: 2, x: 0, y: 0 });
  assert.ok(Math.abs(zoomed.sw - base.sw / 2) < 0.001);
  assert.ok(Math.abs(zoomed.sh - base.sh / 2) < 0.001);
  // Still centred on the same point as the base crop.
  assert.ok(Math.abs(zoomed.sx - (base.sx + base.sw / 4)) < 0.001);
  assert.ok(Math.abs(zoomed.sy - (base.sy + base.sh / 4)) < 0.001);
});

test('zoomedCrop pans within the zoomed-in frame without leaving the native image', () => {
  const box = { w: 300, h: 400 };
  // A rightward pan (positive x) shifts what is visible to the left, i.e.
  // the exported crop moves left relative to the centred 2x crop.
  const centred = zoomedCrop(1920, 1440, box.w, box.h, { scale: 2, x: 0, y: 0 });
  const panned = zoomedCrop(1920, 1440, box.w, box.h, { scale: 2, x: 40, y: 0 });
  assert.ok(panned.sx < centred.sx);
  for (const r of [centred, panned]) {
    assert.ok(r.sx >= 0 && r.sy >= 0);
    assert.ok(r.sx + r.sw <= 1920 + 0.01);
    assert.ok(r.sy + r.sh <= 1440 + 0.01);
  }
});

test('zoomedCrop never expands past what a plain cover crop already shows', () => {
  const box = { w: 300, h: 400 };
  const base = coverCrop(1920, 1440, box.w / box.h);
  for (const scale of [1, 1.5, 3]) {
    const r = zoomedCrop(1920, 1440, box.w, box.h, { scale, x: 0, y: 0 });
    assert.ok(r.sw <= base.sw + 0.01);
    assert.ok(r.sh <= base.sh + 0.01);
  }
});
