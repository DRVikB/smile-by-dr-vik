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

test("mouth-boundary compositing does not classify discoloured tooth pixels as gums", () => {
  // Brown/red enamel, tooth shadows and warm restorations can resemble tissue.
  // Colour must not punch holes into an otherwise permitted mouth edit.
  const original = new Uint8ClampedArray([80,45,50,255, 170,75,85,255, 200,170,120,255, 190,185,175,255]);
  const edited = new Uint8ClampedArray(original.length).fill(255);
  const mask = {x0:1,y0:0,width:2,height:1,alpha:new Float32Array([1,1])};
  const output = compositeMasked(original,edited,4,mask);
  assert.deepEqual(output.slice(0,4),original.slice(0,4));
  assert.deepEqual(output.slice(4,12),edited.slice(4,12));
  assert.deepEqual(output.slice(12),original.slice(12));
});

test("no face means no lock, rather than a guess", () => {
  assert.equal(planMouthLock(null, null), null);
  assert.equal(planMouthLock(face().slice(0, 100), null), null);
  assert.equal(planMouthLock(face(), null), null, "a mouth-only provider output cannot be pasted into the original face");
  assert.equal(planMouthLock(face(), face().slice(0, 100)), null);
});

test("non-finite or inconsistent generated landmarks cannot produce a face lock", () => {
  const original = face();
  const invalid = face(); invalid[33] = [NaN, 10];
  assert.equal(planMouthLock(original, invalid), null);
  const distorted = face();
  distorted[33][0] += 70; distorted[263][1] -= 60; distorted[1][0] -= 65;
  assert.equal(planMouthLock(original, distorted), null, "a plausible overall scale does not validate distorted anchors");
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

// Clinician-authorised smoothing: an unchanged lip contour can include the
// inner lip in the blend, without allowing the mask onto the surrounding face.
test("a stable lip transition does not cut teeth at the inferred inner opening", async () => {
  const { mouthTransitionMask } = await import("../src/lib/face/lock");
  const plan = planMouthLock(face(), face())!;
  plan.polygon = [[30, 30], [70, 30], [70, 50], [30, 50]];
  Object.assign(plan, { outerBoundary: [[20, 20], [80, 20], [80, 60], [20, 60]], feather: 2 });
  const mask = mouthTransitionMask(plan, 100, 100);
  const at = (x: number, y: number) => x < mask.x0 || y < mask.y0 || x >= mask.x0 + mask.width || y >= mask.y0 + mask.height ? 0 : mask.alpha[(y-mask.y0)*mask.width+x-mask.x0];
  assert.equal(at(50, 29), 1, "no original-image slice at the approximate inner lip line");
  assert.equal(at(50, 19), 0, "outer lip contour and surrounding face remain protected");
  assert.ok(at(50, 20) > 0 && at(50, 20) < 1, "transition feathers inside the original outer contour");
});

test("provider lip movement retains the strict original opening", async () => {
  const { mouthTransitionMask } = await import("../src/lib/face/lock");
  const original = face(), generated = original.map(p => [...p] as Point);
  for (const i of OUTER_LIP) generated[i][1] += 25;
  const plan = planMouthLock(original, generated)!;
  assert.equal(plan.lipsMoved, true);
  const mask = mouthTransitionMask(plan, 800, 900);
  assert.deepEqual(mask, polygonMask(plan.polygon, 800, 900, 0, plan.feather, true));
});
