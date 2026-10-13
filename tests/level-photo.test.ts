import { test } from "node:test";
import assert from "node:assert/strict";
import { levelTransform, LEVEL_MIN_DEGREES } from "../src/lib/face/level";
import type { SmileGuides } from "../src/lib/face/guides";

const W = 900, H = 1200;
/** A portrait whose eye line slopes by `degrees` (clockwise positive), eyes a third of the way down. */
function tilted(degrees: number): SmileGuides {
  const t = degrees * Math.PI / 180, half = 150, cx = 450, cy = 420;
  const left: [number, number] = [cx - half * Math.cos(t), cy - half * Math.sin(t)];
  const right: [number, number] = [cx + half * Math.cos(t), cy + half * Math.sin(t)];
  return { width: W, height: H, eyeLine: null, midline: null, mouthLine: { from: [300, 800], to: [600, 800] }, nasalLines: null, pupils: [left, right], commissures: [[330, 800], [570, 800]], smileArc: [[330, 800], [450, 840], [570, 800]] };
}

test("a tilted photograph turns back by exactly its tilt, about the point between the eyes", () => {
  const level = levelTransform(tilted(2.1))!;
  assert.ok(Math.abs(level.degrees - 2.1) < 1e-9);
  assert.ok(Math.abs(level.originX - 0.5) < 1e-9 && Math.abs(level.originY - 0.35) < 1e-9);
  assert.ok(Math.abs(levelTransform(tilted(-3))!.degrees + 3) < 1e-9, "either direction");
});

test("the levelled photograph still covers every corner of its frame", () => {
  for (const degrees of [0.5, 2.1, -4, 8, -15]) {
    const { scale, originX, originY } = levelTransform(tilted(degrees))!;
    assert.ok(scale >= 1 && scale < 1.6, `${degrees}°: enlarged only a little (${scale.toFixed(3)})`);
    const t = degrees * Math.PI / 180, ox = originX * W, oy = originY * H;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const dx = cx - ox, dy = cy - oy;
      const px = ox + (dx * Math.cos(t) - dy * Math.sin(t)) / scale, py = oy + (dx * Math.sin(t) + dy * Math.cos(t)) / scale;
      assert.ok(px >= -1e-6 && px <= W + 1e-6 && py >= -1e-6 && py <= H + 1e-6, `${degrees}°: the corner at ${cx},${cy} shows photograph, not a gap`);
    }
  }
});

test("a level photograph, or a reading that is no tilt at all, is left alone", () => {
  assert.equal(levelTransform(tilted(0)), null);
  assert.equal(levelTransform(tilted(LEVEL_MIN_DEGREES / 2)), null);
  assert.equal(levelTransform(tilted(35)), null, "a slope this steep is a bad detection, not a tilt");
  const swapped = tilted(2.1);
  swapped.pupils = [swapped.pupils[1], swapped.pupils[0]];
  assert.ok(Math.abs(levelTransform(swapped)!.degrees - 2.1) < 1e-9, "whichever eye is listed first");
});
