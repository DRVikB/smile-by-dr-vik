import test from "node:test";
import assert from "node:assert/strict";
import {
  applySimilarity,
  compositeMasked,
  fitSimilarity,
  OUTER_LIP,
  INNER_LIP,
  pointInPolygon,
  polygonMask,
  type Point,
} from "../src/lib/face/geometry";
import { planMouthLock } from "../src/lib/face/lock";

/** A deterministic, face-sized cloud of 478 landmarks with a real mouth. */
function face(): Point[] {
  const pts: Point[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 478; i++) pts.push([300 + rand() * 400, 200 + rand() * 600]);
  // Put the outer lip on an ellipse centred at (500, 650), 200 px wide.
  OUTER_LIP.forEach((index, k) => {
    const t = (k / OUTER_LIP.length) * Math.PI * 2;
    pts[index] = [500 + 100 * Math.cos(t), 650 + 40 * Math.sin(t)];
  });
  INNER_LIP.forEach((index, k) => {
    const t = (k / INNER_LIP.length) * Math.PI * 2;
    pts[index] = [500 + 90 * Math.cos(t), 650 + 18 * Math.sin(t)];
  });
  return pts;
}

test("a fitted similarity recovers a known shift, scale and rotation", () => {
  const from: Point[] = [[0, 0], [100, 0], [0, 100], [100, 100], [50, 20]];
  const truth = { a: 1.05 * Math.cos(0.05), b: 1.05 * Math.sin(0.05), tx: 12, ty: -7 };
  const to = from.map((p) => applySimilarity(truth, p));
  const fit = fitSimilarity(from, to);
  for (const k of ["a", "b", "tx", "ty"] as const)
    assert.ok(Math.abs(fit[k] - truth[k]) < 1e-9, k);
});

test("the mouth mask is solid inside the lips, soft at the edge and off beyond it", () => {
  const square: Point[] = [[20, 20], [60, 20], [60, 60], [20, 60]];
  const mask = polygonMask(square, 100, 100, 2, 8);
  const at = (x: number, y: number) => mask.alpha[(y - mask.y0) * mask.width + (x - mask.x0)];
  assert.equal(at(40, 40), 1);
  assert.equal(at(61, 40), 1); // inside the grow margin
  assert.ok(at(65, 40) > 0 && at(65, 40) < 1); // feathered
  assert.ok(at(64, 40) > at(67, 40)); // falls off with distance
  assert.ok(at(69, 40) < 0.05); // nearly gone at the edge of the feather
  assert.ok(mask.x0 + mask.width <= 70); // and nothing beyond grow + feather
});

test("compositing keeps the original wherever the mask is off", () => {
  const w = 4, h = 1;
  const original = new Uint8ClampedArray(w * h * 4).fill(10);
  const edited = new Uint8ClampedArray(w * h * 4).fill(250);
  const mask = { x0: 1, y0: 0, width: 2, height: 1, alpha: new Float32Array([1, 0.5]) };
  const out = compositeMasked(original, edited, w, mask);
  assert.equal(out[0], 10); // pixel 0: outside the mask
  assert.equal(out[4], 250); // pixel 1: fully edited
  assert.equal(out[8], 130); // pixel 2: half way
  assert.equal(out[12], 10); // pixel 3: outside the mask
});

test("no face means no lock, rather than a guess", () => {
  assert.equal(planMouthLock(null, null), null);
  assert.equal(planMouthLock(face().slice(0, 100), null), null);
});

test("an edit that already lines up is not re-warped", () => {
  const original = face();
  const generated = original.map(([x, y], i) => [x + (i % 2 ? 1 : -1), y] as Point);
  const plan = planMouthLock(original, generated)!;
  assert.equal(plan.warp, false);
  assert.equal(plan.lipsMoved, false);
  assert.deepEqual(plan.polygon, INNER_LIP.map((i) => original[i]));
});

test("an edit the model shifted and rescaled is warped back onto the original", () => {
  const original = face();
  const drift = { a: 1.04, b: 0, tx: -18, ty: 11 };
  const generated = original.map((p) => applySimilarity(drift, p));
  const plan = planMouthLock(original, generated)!;
  assert.equal(plan.warp, true);
  const back = applySimilarity(plan.transform, generated[61]);
  assert.ok(Math.hypot(back[0] - original[61][0], back[1] - original[61][1]) < 0.5);
  assert.equal(plan.lipsMoved, false);
});

test("a reframed face is left alone rather than forced into place", () => {
  const original = face();
  const generated = original.map((p) => applySimilarity({ a: 1.5, b: 0, tx: -250, ty: -300 }, p));
  assert.equal(planMouthLock(original, generated), null);
});

test("an edit that moved the lips themselves is flagged", () => {
  const original = face();
  const generated = original.map((p) => [...p] as Point);
  for (const i of OUTER_LIP) generated[i] = [generated[i][0], generated[i][1] + 25];
  assert.equal(planMouthLock(original, generated)!.lipsMoved, true);
});

test("an opened AI smile cannot replace original lips, covered lower teeth or surrounding face pixels", () => {
  const original = face();
  const generated = original.map(p => [...p] as Point);
  // The lower lip retreats to reveal a row that was hidden in the original.
  for (const i of INNER_LIP) if (generated[i][1] > 650) generated[i][1] += 35;
  const plan = planMouthLock(original, generated)!;
  assert.deepEqual(plan.polygon, INNER_LIP.map(i => original[i]));
  assert.equal(plan.grow, 0);
  assert.equal(plan.warp, false, "lip changes must not scale/shift the teeth through alignment anchors");
  const width = 800, height = 900;
  const mask = polygonMask(plan.polygon, width, height, plan.grow, plan.feather, true);
  const source = new Uint8ClampedArray(width * height * 4).fill(50);
  const hostileEdit = new Uint8ClampedArray(source.length).fill(255);
  const output = compositeMasked(source, hostileEdit, width, mask);
  let changedInside = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = (y * width + x) * 4;
    if (!pointInPolygon([x + 0.5, y + 0.5], plan.polygon)) assert.equal(output[pixel], source[pixel]);
    else if (output[pixel] !== source[pixel]) changedInside++;
  }
  assert.ok(changedInside > 100, "existing visible teeth remain editable");
  assert.equal(output[(685 * width + 500) * 4], 50, "new lower row outside the original opening is rejected");
});

test("inward feather blends only inside the original opening", () => {
  const mask = polygonMask([[20, 20], [60, 20], [60, 60], [20, 60]], 100, 100, 0, 4, true);
  assert.equal(mask.x0, 20);
  assert.equal(mask.width, 40);
  const at = (x: number, y: number) => mask.alpha[(y - mask.y0) * mask.width + x - mask.x0];
  assert.ok(at(20, 40) > 0 && at(20, 40) < 1);
  assert.equal(at(40, 40), 1);
});
