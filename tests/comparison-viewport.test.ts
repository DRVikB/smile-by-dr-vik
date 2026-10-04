import { test } from "node:test";
import assert from "node:assert/strict";
import { containedPhotoRect } from "../src/lib/photoViewport";

test("portrait iPhone: divider viewport excludes top and bottom letterboxing", () => {
  const r = containedPhotoRect(393, 760, 1320, 1741)!;
  assert.equal(r.width, 393);
  assert.ok(r.top > 100);
  assert.equal(r.top * 2 + r.height, 760);
  assert.equal(r.left, 0);
});
test("landscape iPad: divider viewport excludes side letterboxing", () => {
  const r = containedPhotoRect(1100, 650, 1320, 1741)!;
  assert.equal(r.height, 650);
  assert.equal(r.left * 2 + r.width, 1100);
  assert.ok(r.left > 300);
});
test("orientation changes recompute the contained viewport; unavailable dimensions hide it", () => {
  for (const [w,h] of [[393,760],[760,393],[820,1100],[1100,650]]) {
    const r = containedPhotoRect(w,h,2048,1536)!;
    assert.ok(r.width <= w && r.height <= h);
    assert.ok(Math.abs(r.width / r.height - 4/3) < 0.000001);
  }
  assert.equal(containedPhotoRect(0,760,1320,1741), null);
  assert.equal(containedPhotoRect(393,760,0,0), null);
});

import { edgeFadeMask, focusedPhotoRect } from "../src/lib/photoViewport";
import { analysisRegion, knownSmileRegion, smileRegion } from "../src/lib/photoFocus";

const covers = (r: { left: number; top: number; width: number; height: number }, w: number, h: number) =>
  r.left <= 0.001 && r.top <= 0.001 && r.left + r.width >= w - 0.001 && r.top + r.height >= h - 0.001;
const regionOnScreen = (r: { left: number; top: number; width: number; height: number }, box: { x: number; y: number; width: number; height: number }, w: number, h: number) => {
  const x0 = r.left + box.x * r.width, x1 = r.left + (box.x + box.width) * r.width;
  const y0 = r.top + box.y * r.height, y1 = r.top + (box.y + box.height) * r.height;
  return x0 >= -0.001 && y0 >= -0.001 && x1 <= w + 0.001 && y1 <= h + 0.001;
};

test("full screen: a portrait face fills a portrait iPhone with the smile at the anchor", () => {
  const smile = { x: 0.4, y: 0.55, width: 0.2, height: 0.08 };
  const r = focusedPhotoRect(393, 852, 1086, 1448, { region: smile, anchor: { x: 0.5, y: 0.46 }, maxCrop: 0.4 })!;
  assert.ok(covers(r, 393, 852));
  const sx = r.left + 0.5 * r.width, sy = r.top + 0.59 * r.height;
  assert.ok(Math.abs(sx - 196.5) < 1);
  // Vertically the photo exactly fills, so the smile lands as close to the anchor as the edges allow.
  assert.ok(sy > 0.46 * 852 - 1 && sy < 852);
});
test("full screen: a wide close-up is never cropped into the smile on a portrait phone", () => {
  const smile = { x: 0.08, y: 0.3, width: 0.84, height: 0.4 };
  const r = focusedPhotoRect(393, 852, 1600, 1000, { region: smile, maxCrop: 0.4 })!;
  assert.ok(regionOnScreen(r, smile, 393, 852));
  assert.ok(r.width >= 393 * 0.99, "fills the width it can");
});
test("full screen: no dimension loses more than maxCrop, and the photo stays inside any dimension it cannot fill", () => {
  const r = focusedPhotoRect(1194, 834, 1086, 1448, { region: { x: 0.4, y: 0.55, width: 0.2, height: 0.08 }, maxCrop: 0.4 })!;
  assert.ok(834 / r.height >= 0.6 - 1e-9);
  assert.ok(r.width < 1194 && r.left >= 0 && r.left + r.width <= 1194 + 0.001);
});
test("full screen: zoom beyond cover only to bring the smile to the anchor, and never past maxZoom", () => {
  const smile = { x: 0.45, y: 0.6, width: 0.1, height: 0.05 };
  const plain = focusedPhotoRect(393, 852, 1086, 1448, { region: smile, anchor: { x: 0.5, y: 0.5 } })!;
  const zoomed = focusedPhotoRect(393, 852, 1086, 1448, { region: smile, anchor: { x: 0.5, y: 0.5 }, maxZoom: 1.4 })!;
  const capped = focusedPhotoRect(393, 852, 1086, 1448, { region: smile, anchor: { x: 0.5, y: 0.5 }, maxZoom: 1.2 })!;
  const cover = Math.max(393 / 1086, 852 / 1448);
  assert.ok(Math.abs(plain.width / 1086 - cover) < 1e-9);
  // Just enough to put the smile (62.5% down the photo) on the anchor: 0.5·852 / (0.375·1448).
  assert.ok(Math.abs(zoomed.width / 1086 - (0.5 * 852) / (0.375 * 1448)) < 1e-9);
  assert.ok(Math.abs(capped.width / 1086 - cover * 1.2) < 1e-9);
  assert.ok(Math.abs(zoomed.top + 0.625 * zoomed.height - 426) < 1, "smile centred at the anchor");
  assert.ok(covers(zoomed, 393, 852));
  assert.equal(focusedPhotoRect(0, 852, 1086, 1448), null);
});
test("full screen: only the edges that stop short of the frame fade", () => {
  assert.equal(edgeFadeMask({ left: 0, top: 0, width: 400, height: 900 }, 393, 852), undefined);
  const mask = edgeFadeMask({ left: 120, top: -200, width: 900, height: 1200 }, 1020, 820)!;
  assert.match(mask, /^linear-gradient\(90deg, transparent 0, #000 18%, #000 100%\)$/);
});
test("smile focus: lips from saved landmarks, else the capture guide, else an assumption by shape", () => {
  const landmarks = Array.from({ length: 478 }, () => [500, 500] as [number, number]);
  landmarks[61] = [400, 900]; landmarks[291] = [700, 900]; landmarks[0] = [550, 850]; landmarks[17] = [550, 980];
  const snap = { width: 1000, height: 1400, landmarks };
  const r = smileRegion({ analysisSnapshot: snap, width: 2000, height: 2800 });
  assert.deepEqual([r.x, r.y].map(n => +n.toFixed(3)), [0.4, 0.357]);
  // Landmarks from a differently shaped image are ignored.
  assert.equal(knownSmileRegion({ analysisSnapshot: snap, width: 1600, height: 1200 }), null);
  const guide = { x: 0.3, y: 0.54, width: 0.4, height: 0.15 };
  assert.deepEqual(smileRegion({ framing: guide, width: 3, height: 4 }), guide);
  assert.equal(knownSmileRegion({ width: 3, height: 4 }), null);
  assert.ok(smileRegion({ width: 3, height: 4 }).y > 0.35, "portrait: lower middle");
  assert.ok(smileRegion({ width: 4, height: 3 }).width > 0.7, "close-up: most of the width");
  const analysis = analysisRegion({ width: 3, height: 4 });
  assert.ok(analysis.y < smileRegion({ width: 3, height: 4 }).y, "analysis keeps the eye line too");
});
