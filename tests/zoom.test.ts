import test from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY, clampPan, fillScale, zoomAbout } from '../src/components/ZoomPan';

test('the image can never be panned off its own frame', () => {
  const W = 400, H = 300;
  // At natural size there is no slack at all, whatever the drag.
  assert.deepEqual(clampPan({ scale: 1, x: 500, y: -500 }, W, H), { scale: 1, x: 0, y: 0 });
  // At 2x, half the overflow is available on each side.
  assert.deepEqual(clampPan({ scale: 2, x: 999, y: 999 }, W, H), { scale: 2, x: 200, y: 150 });
  assert.deepEqual(clampPan({ scale: 2, x: -999, y: -999 }, W, H), { scale: 2, x: -200, y: -150 });
  // A pan inside the slack is left alone.
  assert.deepEqual(clampPan({ scale: 2, x: 40, y: -20 }, W, H), { scale: 2, x: 40, y: -20 });
  // Scale can never go below fit, so the image cannot shrink inside the frame.
  assert.equal(clampPan({ scale: 0.2, x: 0, y: 0 }, W, H).scale, 1);
});

test('pinching keeps the point under the fingers where it is', () => {
  // Zooming about the centre does not move the centre.
  assert.deepEqual(zoomAbout(IDENTITY, 2, 0, 0, 5), { scale: 2, x: 0, y: 0 });
  // Zooming about an off-centre point pushes the image so that point stays put.
  const off = zoomAbout(IDENTITY, 2, 100, 50, 5);
  assert.deepEqual(off, { scale: 2, x: -100, y: -50 });
  // Zooming back out returns exactly where it started — no drift.
  assert.deepEqual(zoomAbout(off, 1, 100, 50, 5), { scale: 1, x: 0, y: 0 });
});

test('zoom is bounded at both ends', () => {
  assert.equal(zoomAbout(IDENTITY, 99, 0, 0, 5).scale, 5, 'past the maximum');
  assert.equal(zoomAbout(IDENTITY, 0.1, 0, 0, 5).scale, 1, 'below fit');
  assert.equal(zoomAbout({ scale: 3, x: 10, y: 10 }, 0, 0, 0, 5).scale, 1);
});

test('a round trip of pinches leaves no accumulated drift', () => {
  let s = IDENTITY;
  for (const [scale, x, y] of [[1.7, 30, -20], [3.1, -55, 12], [2.2, 8, 44]] as const)
    s = clampPan(zoomAbout(s, scale, x, y, 5), 400, 300);
  s = clampPan(zoomAbout(s, 1, 0, 0, 5), 400, 300);
  assert.equal(s.scale, 1);
  assert.equal(Math.abs(s.x) < 1e-9, true, `x drifted to ${s.x}`);
  assert.equal(Math.abs(s.y) < 1e-9, true, `y drifted to ${s.y}`);
});

test('photos rest at the scale that fills the frame', () => {
  // A portrait photo in a landscape frame must be enlarged by the ratio of the two shapes to cover it.
  assert.equal(fillScale(3, 4, 400, 300), (400 / 300) / (3 / 4));
  // The same shape fills at scale 1; either orientation mismatch enlarges.
  assert.equal(fillScale(4, 3, 400, 300), 1);
  assert.ok(fillScale(4, 3, 300, 400) > 1);
  // Unknown sizes fall back to the whole photo.
  assert.equal(fillScale(0, 0, 400, 300), 1);
});

test('a contained photo can be panned only as far as it overflows the frame', () => {
  // Portrait photo contained in a 400x300 frame: 225 wide, 300 tall at scale 1.
  const cw = 225, ch = 300;
  // At the fill scale (400/225) it covers the width exactly and overflows vertically.
  const fill = 400 / 225;
  const s = clampPan({ scale: fill, x: 999, y: 999 }, 400, 300, cw, ch);
  assert.equal(s.x, 0);
  assert.ok(Math.abs(s.y - (ch * fill - 300) / 2) < 1e-9);
  // Zoomed out to the whole photo, nothing can be dragged.
  assert.deepEqual(clampPan({ scale: 1, x: 50, y: 50 }, 400, 300, cw, ch), { scale: 1, x: 0, y: 0 });
});
