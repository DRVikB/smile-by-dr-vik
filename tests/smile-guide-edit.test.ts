import { test } from "node:test";
import assert from "node:assert/strict";
import { bakeGuide, guideGeometry, moveGuideDivision, newGuide, normaliseGuide, shiftGuideCurve, templateShape, type SmileGuide } from "../src/lib/smileDesign/frame";

const base = (): SmileGuide => ({ ...newGuide({ cx: 500, cy: 600, halfWidth: 200, angle: 0.03 }, templateShape(1.1, 0.02)), width: 1.12, length: 0.9, curve: 1.3, dx: 0.04, dy: -0.02 });
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("baking the sliders into the shape leaves the guide exactly where it was", () => {
  const g = base(), baked = bakeGuide(g);
  assert.deepEqual([baked.width, baked.length, baked.curve, baked.dx, baked.dy], [1, 1, 1, 0, 0]);
  assert.ok(baked.original, "the first fit is kept for Reset");
  const a = guideGeometry(g, "oval"), b = guideGeometry(baked, "oval");
  for (const key of ["gum", "edge"] as const) a[key].forEach((p, i) => { close(p[0], b[key][i][0], 1e-3); close(p[1], b[key][i][1], 1e-3); });
  a.teeth.forEach((t, k) => t.outline.forEach((p, i) => { close(p[0], b.teeth[k].outline[i][0], 1e-3); close(p[1], b.teeth[k].outline[i][1], 1e-3); }));
  assert.deepEqual(bakeGuide(baked).original, baked.original, "baking again keeps the very first fit");
});

test("the gum-line and edge points raise, lower or tilt only their own line", () => {
  const g = bakeGuide(base());
  const down = shiftGuideCurve(g, "edge", "centre", 0.05);
  down.shape.edge.forEach((y, i) => close(y, g.shape.edge[i] + 0.05));
  assert.deepEqual(down.shape.gum, g.shape.gum);
  const tilt = shiftGuideCurve(g, "gum", "left", -0.04);
  close(tilt.shape.gum[0], g.shape.gum[0] - 0.04);
  close(tilt.shape.gum[20], g.shape.gum[20]);
  close(tilt.shape.gum[40], g.shape.gum[40]);
  // The gum line can never cross below the edge.
  const crushed = shiftGuideCurve(g, "gum", "centre", 5);
  // (At the far corners the fitted lines can already meet; those points are left as they were.)
  crushed.shape.gum.forEach((y, i) => { if (g.shape.gum[i] < g.shape.edge[i]) assert.ok(y < crushed.shape.edge[i]); else close(y, g.shape.gum[i]); });
  crushed.shape.teeth.forEach(([top, bottom]) => assert.ok(top < bottom));
});

test("a boundary point changes one tooth's width and never crosses its neighbours or the midline", () => {
  const g = bakeGuide(base());
  const wider = moveGuideDivision(g, 2, g.shape.divisions[2] - 0.05);
  close(wider.shape.divisions[2], g.shape.divisions[2] - 0.05);
  assert.deepEqual(wider.shape.divisions.filter((_, i) => i !== 2), g.shape.divisions.filter((_, i) => i !== 2));
  const squeezed = moveGuideDivision(g, 2, 0.5);
  assert.ok(squeezed.shape.divisions[2] < squeezed.shape.divisions[3]);
  assert.equal(moveGuideDivision(g, 3, 0.2), g, "the midline isn't a boundary handle");
  assert.ok(normaliseGuide(squeezed), "edited guides stay valid");
});

test("an edited guide saves and loads with its original fit", () => {
  const edited = shiftGuideCurve(bakeGuide(base()), "edge", "right", 0.03);
  const loaded = normaliseGuide(JSON.parse(JSON.stringify(edited)))!;
  assert.deepEqual(loaded.original, edited.original);
  assert.deepEqual(loaded.shape.edge, edited.shape.edge);
});
