import test from "node:test";
import assert from "node:assert/strict";
import { analyseSmile, analysisRows, IRIS_DIAMETER_MM } from "../src/lib/face/analysis";
import { IRIS_LEFT, IRIS_RIGHT, OUTER_LIP, type Point } from "../src/lib/face/geometry";

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
