import test from "node:test";
import assert from "node:assert/strict";
import type { Point } from "../src/lib/face/geometry";
import { curveAt, DIVISIONS, guideGeometry, newGuide, normaliseGuide, placeTemplate, SHAPE_STYLE, templateShape } from "../src/lib/smileDesign/frame";
import { measureSmile, openingFromTeeth, robustQuadratic } from "../src/lib/smileDesign/measure";

const FIT = { cx: 500, cy: 400, halfWidth: 200, angle: 0 };
const guide = (patch = {}) => ({ ...newGuide(FIT, templateShape(1.5)), ...patch });

test("a saved guide is checked and its adjustments kept in range", () => {
  assert.equal(normaliseGuide(null), undefined);
  assert.equal(normaliseGuide({ ...guide(), version: 1 }), undefined);
  assert.equal(normaliseGuide({ ...guide(), fit: { ...FIT, halfWidth: 0 } }), undefined);
  assert.equal(normaliseGuide({ ...guide(), shape: { ...templateShape(1), divisions: [0, 0, 0, 0, 0, 0, 0] } }), undefined);
  assert.equal(normaliseGuide({ ...guide(), shape: { ...templateShape(1), gum: [1, 2] } }), undefined);
  const g = normaliseGuide({ ...guide(), width: 9, length: -1, curve: "deep", dx: 2, visible: false })!;
  assert.deepEqual([g.width, g.length, g.curve, g.dx, g.dy, g.visible], [1.3, 0.7, 1, 0.5, 0, false]);
  assert.deepEqual(normaliseGuide(guide()), guide());
});

test("the guide sits on the midline with each tooth in its own box", () => {
  const g = guideGeometry(guide(), SHAPE_STYLE.Rounded);
  assert.deepEqual(g.teeth.map(t => t.fdi), [13, 12, 11, 21, 22, 23]);
  assert.ok(Math.abs(g.midline[0][0] - FIT.cx) < 1e-6 && Math.abs(g.midline[1][0] - FIT.cx) < 1e-6);
  // Patient's right (quadrant 1) is on the image's left, and each outline stays between its boundaries.
  const xs = (fdi: number) => g.teeth.find(t => t.fdi === fdi)!.outline.map(p => p[0]);
  assert.ok(Math.max(...xs(11)) <= FIT.cx + 1e-6 && Math.min(...xs(21)) >= FIT.cx - 1e-6);
  assert.ok(Math.max(...xs(13)) <= Math.min(...xs(11)) + 1e-6);
  const right = g.divisions.map(([a]) => a[0]).filter(x => x > FIT.cx).sort((a, b) => a - b);
  DIVISIONS.slice(1).forEach((d, i) => assert.ok(Math.abs(right[i] - (FIT.cx + d * FIT.halfWidth)) < 1e-6));
});

test("a tooth's measured top and edge move only that tooth", () => {
  const shape = templateShape(1.5);
  shape.teeth[2] = [shape.teeth[2][0] + 0.05, shape.teeth[2][1]];
  const base = guideGeometry(guide(), "oval"), moved = guideGeometry(guide({ shape }), "oval");
  const top = (g: typeof base, fdi: number) => Math.min(...g.teeth.find(t => t.fdi === fdi)!.outline.map(p => p[1]));
  assert.ok(Math.abs(top(moved, 11) - top(base, 11) - 10) < 0.5);
  assert.equal(top(moved, 21), top(base, 21));
});

test("width, length, curve and nudges change the guide as labelled", () => {
  const base = guideGeometry(guide(), "oval");
  const wide = guideGeometry(guide({ width: 1.2 }), "oval");
  assert.ok(wide.gum[0][0] < base.gum[0][0] && wide.gum[40][0] > base.gum[40][0]);
  const long = guideGeometry(guide({ length: 1.2 }), "oval");
  assert.ok(long.edge[20][1] > base.edge[20][1]);
  const flat = guideGeometry(guide({ curve: 0 }), "oval");
  assert.ok(Math.abs(flat.edge[0][1] - flat.edge[20][1]) < 1e-6);
  const moved = guideGeometry(guide({ dx: 0.1, dy: -0.05 }), "oval");
  assert.ok(Math.abs(moved.midline[0][0] - (FIT.cx + 20)) < 1e-6 && Math.abs(moved.gum[20][1] - base.gum[20][1] + 10) < 1e-6);
});

test("without measurable teeth the template is placed from the face", () => {
  const points: Point[] = Array.from({ length: 478 }, () => [300, 300] as Point);
  points[61] = [200, 400]; points[291] = [400, 400];
  for (const i of [168, 1, 0, 17]) points[i] = [310, 300];
  points[13] = [310, 380]; points[14] = [310, 440];
  const placed = placeTemplate(points)!;
  assert.deepEqual([placed.fit.cx, placed.fit.cy, placed.fit.halfWidth, placed.fit.angle], [310, 400, 100, 0]);
  assert.equal(placed.shape.measured, false);
  // The gum line at the midline sits just below the upper lip, the edge within the opening.
  assert.ok(Math.abs(curveAt(placed.shape.gum, 0) * 100 - (-20 + 60 * 0.04)) < 1e-6);
  assert.ok(Math.abs(curveAt(placed.shape.edge, 0) * 100 - (-20 + 60 * 0.8)) < 1e-6);
  assert.equal(placeTemplate(points.slice(0, 400)), null);
});

test("curve fitting isn't pulled off by a gap of stray columns", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i);
  const ys = xs.map(x => (x >= 30 && x < 45 ? 80 : 50 + 0.002 * (x - 50) ** 2));
  const fit = robustQuadratic(xs, ys, 50, 50);
  assert.ok(Math.abs(fit(50) - 50) < 1 && Math.abs(fit(5) - (50 + 0.002 * 45 ** 2)) < 2);
});

// A synthetic level mouth: dark oral space, ivory upper teeth with darker
// interproximal lines and small edge notches at known boundaries.
const W = 400, H = 160, HALF = 180, MID = 200;
const IVORY = [232, 218, 186], CONTACT = [168, 150, 122], DARK = [36, 20, 18];
const CENTRAL = Math.round(DIVISIONS[1] * HALF), LATERAL = Math.round(CENTRAL * 0.71), CANINE = Math.round(CENTRAL * 0.54);
const TRUTH = [MID - CENTRAL - LATERAL - CANINE, MID - CENTRAL - LATERAL, MID - CENTRAL, MID, MID + CENTRAL, MID + CENTRAL + LATERAL, MID + CENTRAL + LATERAL + CANINE];
function mouth(lower = false) {
  const px = new Uint8ClampedArray(W * H * 4), opening = new Uint8Array(W * H);
  const bounds = [...TRUTH, MID - 2 * CENTRAL - CANINE, MID + 2 * CENTRAL + CANINE];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = y >= 40 && y <= 140 && x >= 20 && x < W - 20;
    opening[i] = inside ? 1 : 0;
    const near = Math.min(...bounds.map(b => Math.abs(x - b)));
    let c = DARK;
    if (inside && y >= 44 && y <= 100 && x > 60 && x < 340) c = near <= 1 ? CONTACT : y >= 96 && near <= 3 ? DARK : IVORY;
    // Lower teeth meeting the upper edges, with a shadow line between them.
    if (lower && inside && x > 60 && x < 340) c = y >= 101 && y <= 103 ? DARK : y > 103 ? IVORY : c;
    px.set([...c, 255], i * 4);
  }
  return { px, opening };
}

test("the teeth are measured: midline, each boundary, top and biting edge", () => {
  const { px, opening } = mouth();
  const m = measureSmile(px, W, H, opening, HALF, MID + 8)!;
  assert.ok(m.found >= 6, `found ${m.found}`);
  m.boundaries.forEach((b, i) => assert.ok(Math.abs(b - TRUTH[i]) <= 3, `boundary ${i}: ${b} vs ${TRUTH[i]}`));
  for (const [top, bottom] of m.teeth.slice(1, 5)) { assert.ok(Math.abs(top - 44) <= 2); assert.ok(Math.abs(bottom - 100) <= 3); }
});

test("upper teeth meeting the lower teeth are cut at the shadow line between them", () => {
  const { px, opening } = mouth(true);
  const m = measureSmile(px, W, H, opening, HALF, MID)!;
  assert.ok(m, "measured");
  for (const [, bottom] of m.teeth.slice(2, 4)) assert.ok(Math.abs(bottom - 100) <= 3, `edge ${bottom}`);
});

test("a close-up's teeth are the tooth-coloured area with lips above and below", () => {
  const w = 200, h = 120, weights = new Float32Array(w * h), red = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (y < 30) weights[i] = 1;                                  // pale skin above the mouth
    else if (y < 50 || (y >= 80 && y < 100)) red[i] = 1;         // upper and lower lip
    else if (y < 80 && x >= 30 && x < 170) weights[i] = 1;       // teeth
  }
  const found = openingFromTeeth(weights, red, w, h)!;
  assert.deepEqual([found.x0, found.x1, found.y0, found.y1], [30, 169, 50, 79]);
});
