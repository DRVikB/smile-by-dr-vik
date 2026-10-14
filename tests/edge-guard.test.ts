import test from "node:test";
import assert from "node:assert/strict";
import { guardUpperEdges } from "../src/lib/edgeGuard";

// A synthetic mouth: an opening of dark oral space, ivory upper teeth from the top
// of the opening down to `edge`, and (optionally) lower teeth from `lowerTop` down.
const W = 80, H = 60, TOP = 10, BOTTOM = 50;
const IVORY = [230, 215, 180], DARK = [40, 22, 20], SKIN = [200, 150, 130];
function mouth(edge: number, lowerTop?: number) {
  const px = new Uint8ClampedArray(W * H * 4), opening = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = y >= TOP && y <= BOTTOM && x >= 5 && x < W - 5;
    if (inside) opening[i] = 1;
    const c = !inside ? SKIN : y <= edge ? IVORY : lowerTop !== undefined && y >= lowerTop ? IVORY : DARK;
    px.set([...c, 255], i * 4);
  }
  return { px, opening };
}
const at = (px: Uint8ClampedArray, x: number, y: number) => [...px.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];

test("edge guard: upper teeth that came out longer are trimmed back to the original edge", () => {
  const original = mouth(30), result = mouth(36);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "trimmed");
  assert.equal(r.extraPx, 6);
  // Tolerance is max(2 px, 5% of the 20 px tooth): rows up to 32 keep the new teeth, the edge then fades
  // over four rows (half way at row 34) and from row 36 it is the original dark space.
  assert.deepEqual(at(r.pixels, 40, 31), IVORY);
  const fading = at(r.pixels, 40, 34);
  assert.ok(fading[0] < IVORY[0] && fading[0] > DARK[0], "the new edge fades into the original rather than stopping");
  assert.deepEqual(at(r.pixels, 40, 36), DARK);
  assert.deepEqual(at(r.pixels, 40, 37), DARK);
  // Outside the checked span (the corners of the mouth) nothing is touched.
  assert.deepEqual(at(r.pixels, 7, 36), IVORY);
});

test("edge guard: a result within tolerance is left exactly as it was", () => {
  const original = mouth(30), result = mouth(31);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "within-tolerance");
  assert.equal(r.pixels, result.px);
});

test("edge guard: teeth that can't be separated from the lower teeth are never trimmed", () => {
  // Upper teeth meet the lower teeth: no gap, so the upper edge can't be measured.
  const original = mouth(30, 31), result = mouth(36, 37);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.trimmed, false);
  assert.equal(r.reason, "unmeasurable");
});

test("edge guard: an implausibly large difference is not 'corrected'", () => {
  const original = mouth(22), result = mouth(40);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  assert.equal(r.reason, "implausible");
  assert.equal(r.pixels, result.px);
});

// A mouth whose upper edge differs by column (worn, chipped or uneven teeth).
function mouthWithEdges(edgeAt: (x: number) => number) {
  const px = new Uint8ClampedArray(W * H * 4), opening = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = y >= TOP && y <= BOTTOM && x >= 5 && x < W - 5;
    if (inside) opening[i] = 1;
    px.set([...(!inside ? SKIN : y <= edgeAt(x) ? IVORY : DARK), 255], i * 4);
  }
  return { px, opening };
}

test("edge guard: worn, uneven edges are never used as a cutting line", () => {
  // Every other tooth worn short by a third: the design is there to rebuild them.
  const worn = mouthWithEdges(x => (Math.floor(x / 8) % 2 ? 30 : 23));
  const rebuilt = mouth(33);
  const out = guardUpperEdges(worn.px, rebuilt.px, W, H, worn.opening);
  assert.equal(out.reason, "irregular");
  assert.equal(out.trimmed, false);
  assert.equal(out.pixels, rebuilt.px);
});

test("edge guard: a chipped tooth is restored to its neighbours' level, and the trimmed line is smooth", () => {
  // Even edges at 30 with one narrow chip up to 26.
  const chipped = mouthWithEdges(x => (x >= 38 && x <= 41 ? 26 : 30));
  const longer = mouth(35);
  const out = guardUpperEdges(chipped.px, longer.px, W, H, chipped.opening);
  assert.equal(out.reason, "trimmed");
  // Where the chip was, the new tooth reaches the same line as its neighbours.
  const edgeIn = (x: number) => { let y = TOP; while (y < BOTTOM && at(out.pixels, x, y + 1)[0] > 150) y++; return y; };
  assert.ok(Math.abs(edgeIn(40) - edgeIn(30)) <= 1, `chip column ${edgeIn(40)} vs neighbour ${edgeIn(30)}`);
  // Neighbouring columns never differ by more than a pixel: no torn edge.
  for (let x = 26; x < 54; x++) assert.ok(Math.abs(edgeIn(x) - edgeIn(x + 1)) <= 1, `step at ${x}`);
  // And the extra length is gone.
  assert.ok(edgeIn(30) < 35);
});

test("edge guard: a trim fades across neighbouring columns, never a step between teeth", () => {
  const original = mouth(30), result = mouth(36);
  const r = guardUpperEdges(original.px, result.px, W, H, original.opening);
  // Down one row in the fade, the change from column to column is gradual, without a jump of more than a third of the range.
  const row = [...Array(W).keys()].map(x => at(r.pixels, x, 34)[0]);
  const jumps = row.slice(1).map((v, i) => Math.abs(v - row[i]));
  assert.ok(Math.max(...jumps) <= (IVORY[0] - DARK[0]) / 3);
});

