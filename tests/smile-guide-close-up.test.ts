import test from "node:test";
import assert from "node:assert/strict";
import { guideFromToothMap } from "../src/lib/smileDesign/fitPhoto";
import type { ToothMap } from "../src/lib/toothMap/types";

/** A tooth as a box in a 1000×750 close-up (normalised outline). */
function tooth(fdi: number | null, x0: number, x1: number, top: number, bottom: number) {
  const W = 1000, H = 750;
  return { fdi, visible: true, outline: [[x0 / W, top / H], [x1 / W, top / H], [x1 / W, bottom / H], [x0 / W, bottom / H]] };
}
const map = (teeth: ReturnType<typeof tooth>[]) => ({ teeth } as unknown as Pick<ToothMap, "teeth">);

test("six numbered front teeth give the seven boundaries and the midline between the centrals", () => {
  const fitted = guideFromToothMap(map([
    tooth(13, 250, 330, 300, 400), tooth(12, 330, 410, 290, 420), tooth(11, 410, 500, 280, 450),
    tooth(21, 500, 590, 280, 450), tooth(22, 590, 670, 290, 420), tooth(23, 670, 750, 300, 400),
  ]), 1000, 750)!;
  assert.ok(fitted);
  assert.equal(fitted.fit.cx, 500);
  assert.equal(fitted.fit.angle, 0);
  const d = fitted.shape.divisions;
  assert.equal(d.length, 7);
  assert.equal(d[3], 0);
  assert.ok(d.every((v, i) => i === 0 || v > d[i - 1]));
  // The canines' outer edges sit where the template puts them.
  assert.ok(Math.abs(Math.max(-d[0], d[6]) - 0.5372) < 1e-6);
  assert.equal(fitted.shape.measured, true);
});

test("without numbers the widest pair in the middle is taken as the centrals", () => {
  const fitted = guideFromToothMap(map([
    tooth(null, 330, 410, 290, 420), tooth(null, 410, 500, 280, 450), tooth(null, 500, 590, 280, 450), tooth(null, 590, 670, 290, 420),
  ]), 1000, 750)!;
  assert.ok(fitted);
  assert.equal(fitted.fit.cx, 500);
});

test("missing canines are filled from the guide's proportions", () => {
  const fitted = guideFromToothMap(map([tooth(12, 330, 410, 290, 420), tooth(11, 410, 500, 280, 450), tooth(21, 500, 590, 280, 450), tooth(22, 590, 670, 290, 420)]), 1000, 750)!;
  const d = fitted.shape.divisions;
  assert.ok(d[0] < d[1] && d[6] > d[5]);
});

test("a single tooth is not enough for a guide", () => {
  assert.equal(guideFromToothMap(map([tooth(11, 410, 500, 280, 450)]), 1000, 750), null);
});
