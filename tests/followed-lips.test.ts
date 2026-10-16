import { test } from "node:test";
import assert from "node:assert/strict";
import { lipsCanBeFollowed, mouthTransitionMask, type LockPlan } from "../src/lib/face/lock";

// A mouth 200 px wide whose lips are almost closed; the result parts them.
const ellipse = (cx: number, cy: number, rx: number, ry: number): [number, number][] =>
  Array.from({ length: 20 }, (_, i) => [cx + rx * Math.cos((i / 20) * 2 * Math.PI), cy + ry * Math.sin((i / 20) * 2 * Math.PI)]);
const plan = (generatedRy: number, lipsMoved = true): LockPlan => ({
  transform: { a: 1, b: 0, tx: 0, ty: 0 }, warp: false, lipsMoved,
  polygon: ellipse(200, 150, 90, 8), outerBoundary: ellipse(200, 150, 100, 22), generatedOuter: ellipse(200, 150, 104, generatedRy),
  grow: 0, feather: 1,
});
const at = (m: { x0: number; y0: number; width: number; height: number; alpha: Float32Array }, x: number, y: number) => {
  const mx = x - m.x0, my = y - m.y0;
  return mx >= 0 && my >= 0 && mx < m.width && my < m.height ? m.alpha[my * m.width + mx] : 0;
};

test("lips the result parted are kept, with a soft edge into the face", () => {
  const p = plan(48);
  assert.equal(lipsCanBeFollowed(p), true);
  const strict = mouthTransitionMask(p, 400, 300), followed = mouthTransitionMask(p, 400, 300, { followLips: true });
  // 30 px below the centre: inside the result's lips, outside the photographed opening.
  assert.equal(at(strict, 200, 180), 0);
  assert.equal(at(followed, 200, 180), 1);
  // The edge fades rather than cuts, and the face away from the mouth is untouched.
  const edge = at(followed, 200, 150 + 48 + 12);
  assert.ok(edge > 0 && edge < 1, `edge ${edge}`);
  assert.equal(at(followed, 200, 260), 0);
  assert.equal(at(followed, 30, 150), 0);
});

test("lips not asked to follow, or moved too far, keep the photographed opening", () => {
  const p = plan(48);
  // Not asked to follow.
  assert.equal(at(mouthTransitionMask(p, 400, 300), 200, 180), 0);
  // The result's lips have gone somewhere implausible: more than a third of the mouth's width.
  const far = plan(120);
  assert.equal(lipsCanBeFollowed(far), false);
  assert.equal(at(mouthTransitionMask(far, 400, 300, { followLips: true }), 200, 180), 0);
});

test("a pixel-verified result with no lip landmarks follows within a band around the patient's lips", () => {
  const p = { ...plan(48), generatedOuter: undefined };
  assert.equal(lipsCanBeFollowed(p), true);
  const m = mouthTransitionMask(p, 400, 300, { followLips: true });
  // Just below the photographed lips: included; well away from the mouth: the patient's face.
  assert.equal(at(m, 200, 150 + 22 + 5), 1);
  assert.equal(at(m, 200, 280), 0);
  assert.equal(at(m, 20, 150), 0);
});
