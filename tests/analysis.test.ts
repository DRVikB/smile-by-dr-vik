import test from "node:test";
import assert from "node:assert/strict";
import { analyseSmile, analysisRows, IRIS_DIAMETER_MM } from "../src/lib/face/analysis";
import { IRIS_LEFT, IRIS_RIGHT, OUTER_LIP, type Point } from "../src/lib/face/geometry";
import { clipLine, faceCrop, scaleGuides, smileGuides, smoothCurve, smoothCurvePath, GUIDE_ORDER, GUIDE_STYLES } from "../src/lib/face/guides";

/** A level synthetic face: pupils 240 px apart, irises 46 px across. */
function face(opts: { tilt?: number; mouthShift?: number; mouthSlope?: number } = {}): Point[] {
  const pts: Point[] = Array.from({ length: 478 }, (_, i) => [400 + (i % 40) * 5, 300 + Math.floor(i / 40) * 40] as Point);
  const eyeY = 500;
  const irises: [typeof IRIS_RIGHT | typeof IRIS_LEFT, number][] = [[IRIS_RIGHT, 380], [IRIS_LEFT, 620]];
  for (const [iris, x] of irises) {
    pts[iris.centre] = [x, eyeY];
    const [a, b, c, d] = iris.ring;
    pts[a] = [x + 23, eyeY]; pts[b] = [x, eyeY - 23]; pts[c] = [x - 23, eyeY]; pts[d] = [x, eyeY + 23];
  }
  pts[168] = [500, 480]; // glabella
  const shift = opts.mouthShift ?? 0, slope = opts.mouthSlope ?? 0;
  OUTER_LIP.forEach((index, k) => {
    const t = (k / OUTER_LIP.length) * Math.PI * 2;
    pts[index] = [500 + shift + 130 * Math.cos(t), 760 + 35 * Math.sin(t)];
  });
  pts[61] = [370 + shift, 760 - slope];
  pts[291] = [630 + shift, 760 + slope];
  if (opts.tilt) {
    const r = (opts.tilt * Math.PI) / 180, [cx, cy] = [500, 600];
    return pts.map(([x, y]) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)] as Point);
  }
  return pts;
}

test("no landmarks, no analysis", () => {
  assert.equal(analyseSmile(null, 1000, 1200), null);
  assert.equal(analyseSmile(face().slice(0, 468), 1000, 1200), null);
});

test("a level, centred smile reads as level and centred, with iris-scaled mm", () => {
  const a = analyseSmile(face(), 1000, 1200)!;
  assert.ok(Math.abs(a.headTiltDeg) < 0.01);
  assert.ok(Math.abs(a.cantDeg) < 0.01);
  assert.ok(Math.abs(a.midlineOffsetPx) < 0.01);
  assert.ok(Math.abs(a.mmPerPx! - IRIS_DIAMETER_MM / 46) < 1e-9);
  assert.ok(Math.abs(a.smileWidthMm! - 260 * (IRIS_DIAMETER_MM / 46)) < 1e-6);
  const rows = analysisRows(a);
  assert.equal(rows.find((r) => r.label === "Smile centre vs facial midline")!.value, "Centred");
});

test("a whole-head tilt is reported as tilt, not as a canted smile", () => {
  const a = analyseSmile(face({ tilt: 6 }), 1000, 1200)!;
  assert.ok(Math.abs(a.headTiltDeg - 6) < 0.01);
  assert.ok(Math.abs(a.cantDeg) < 0.01);
});

test("a sloping mouth-corner line and an off-centre smile are measured", () => {
  const a = analyseSmile(face({ mouthShift: 23, mouthSlope: 9 }), 1000, 1200)!;
  // 18 px drop over 260 px ≈ 3.96°
  assert.ok(Math.abs(a.cantDeg - (Math.atan2(18, 260) * 180) / Math.PI) < 0.01);
  assert.ok(Math.abs(a.midlineOffsetPx - 23) < 0.01);
  const row = analysisRows(a).find((r) => r.label === "Smile centre vs facial midline")!;
  assert.match(row.value, /% of mouth width to photo right/);
  assert.ok(analysisRows(a).every(r => !/\d+ mm/.test(r.value)));
});

test("reference lines are clipped to the photo, edge to edge", () => {
  const level = clipLine([300, 500], [1, 0], 1000, 1200)!;
  assert.deepEqual([level.from, level.to], [[0, 500], [1000, 500]]);
  const upright = clipLine([500, 480], [0, 1], 1000, 1200)!;
  assert.deepEqual([upright.from, upright.to], [[500, 0], [500, 1200]]);
  const diagonal = clipLine([0, 0], [1, 1], 1000, 1200)!;
  assert.deepEqual([diagonal.from, diagonal.to], [[0, 0], [1000, 1000]]);
  assert.equal(clipLine([500, -10], [1, 0], 1000, 1200), null, "a line above the photo misses it");
  assert.equal(clipLine([500, 500], [0, 0], 1000, 1200), null);
});

test("all four guides land on one photo: eye line through the pupils, midline through the glabella", () => {
  const a = analyseSmile(face(), 1000, 1200)!;
  const g = smileGuides(a, 1000, 1200);
  assert.deepEqual([g.eyeLine!.from[1], g.eyeLine!.to[1]], [500, 500]);
  assert.deepEqual([g.eyeLine!.from[0], g.eyeLine!.to[0]], [0, 1000]);
  assert.ok(Math.abs(g.midline!.from[0] - 500) < 1e-9 && Math.abs(g.midline!.to[0] - 500) < 1e-9);
  // Mouth line reaches a little past each corner, along the corners' own slope.
  assert.ok(g.mouthLine.from[0] < 370 && g.mouthLine.to[0] > 630);
  assert.equal(g.mouthLine.from[1], 760);
  assert.equal(g.smileArc.length, a.lowerLipCurve.length);
  // Tilted heads keep the midline square to the eye line.
  const t = smileGuides(analyseSmile(face({ tilt: 8 }), 1000, 1200)!, 1000, 1200);
  const eye = [t.eyeLine!.to[0] - t.eyeLine!.from[0], t.eyeLine!.to[1] - t.eyeLine!.from[1]];
  const mid = [t.midline!.to[0] - t.midline!.from[0], t.midline!.to[1] - t.midline!.from[1]];
  assert.ok(Math.abs(eye[0] * mid[0] + eye[1] * mid[1]) / (Math.hypot(eye[0], eye[1]) * Math.hypot(mid[0], mid[1])) < 1e-9);
});

test("guides move with the photo's size, and each line has its own colour", () => {
  const g = smileGuides(analyseSmile(face(), 1000, 1200)!, 1000, 1200);
  const half = scaleGuides(g, 500, 600);
  assert.deepEqual(half.pupils[0], [g.pupils[0][0] / 2, g.pupils[0][1] / 2]);
  assert.deepEqual(half.eyeLine!.to, [500, 250]);
  assert.equal(new Set(GUIDE_ORDER.map((k) => GUIDE_STYLES[k].colour)).size, GUIDE_ORDER.length);
});

test("the smile arc is one smooth path ending on the last point", () => {
  const pts: Point[] = [[0, 0], [10, 10], [20, 12], [30, 10], [40, 0]];
  const { start, segments } = smoothCurve(pts);
  assert.deepEqual(start, [0, 0]);
  assert.deepEqual(segments.at(-1), [[40, 0], [40, 0]]);
  assert.equal(segments.length, pts.length - 1);
  assert.match(smoothCurvePath(pts), /^M0 0 Q10 10 15 11 .* Q40 0 40 0$/);
});

test("the report frames the face at the panel's shape, inside the photo", () => {
  const a = analyseSmile(face(), 1000, 1200)!;
  const crop = faceCrop(a, 4 / 5, 1000, 1200);
  assert.ok(Math.abs(crop.w / crop.h - 4 / 5) < 1e-9);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 1000 + 1e-9 && crop.y + crop.h <= 1200 + 1e-9);
  // Wider than the photo allows: shrinks, still the right shape.
  const wide = faceCrop(a, 3, 1000, 1200);
  assert.ok(Math.abs(wide.w / wide.h - 3) < 1e-9 && wide.w <= 1000 + 1e-9);
});
