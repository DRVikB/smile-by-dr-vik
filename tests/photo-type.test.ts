import test from "node:test";
import assert from "node:assert/strict";
import { shotTypeFromLandmarks } from "../src/lib/photoType";
import type { Point } from "../src/lib/face/geometry";

/** A 478-point face: eye corners, bridge, chin and mouth corners placed; the rest at the face centre. */
function face(o: { eyeY: number; chinY: number; mouth: [number, number]; mouthY: number; centre?: number }): Point[] {
  const c = o.centre ?? 500;
  const p: Point[] = Array.from({ length: 478 }, () => [c, o.mouthY] as Point);
  p[33] = [c - 120, o.eyeY]; p[263] = [c + 120, o.eyeY]; p[168] = [c, o.eyeY]; p[152] = [c, o.chinY];
  p[61] = [o.mouth[0], o.mouthY]; p[291] = [o.mouth[1], o.mouthY];
  return p;
}

test("a whole face in a portrait photo is a full-face photo", () => {
  assert.equal(shotTypeFromLandmarks(face({ eyeY: 500, chinY: 950, mouth: [430, 570], mouthY: 820 }), 1000, 1333), "Full face");
});

test("no face found is a close-up", () => {
  assert.equal(shotTypeFromLandmarks(null, 1000, 750), "Close-up");
});

test("eyes placed outside the picture (lips and nose only) is a close-up", () => {
  assert.equal(shotTypeFromLandmarks(face({ eyeY: -260, chinY: 820, mouth: [180, 820], mouthY: 430 }), 1000, 750), "Close-up");
});

test("a mouth across half the picture is a close-up, even with the eyes just in frame", () => {
  assert.equal(shotTypeFromLandmarks(face({ eyeY: 40, chinY: 740, mouth: [220, 780], mouthY: 520 }), 1000, 750), "Close-up");
});

test("too few points or no size is a close-up rather than a guess at a face", () => {
  assert.equal(shotTypeFromLandmarks([[1, 1]], 1000, 750), "Close-up");
  assert.equal(shotTypeFromLandmarks(face({ eyeY: 500, chinY: 950, mouth: [430, 570], mouthY: 820 }), 0, 0), "Close-up");
});
