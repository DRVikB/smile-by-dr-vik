import test from "node:test";
import assert from "node:assert/strict";
import { cropFraming, faceCentre, selfieCrop } from "../src/lib/photoAspect";

test("an iPad's landscape front-camera photo is cropped to portrait 3:4 around the smile", () => {
  const guide = { x: 0.4, y: 0.55, width: 0.2, height: 0.15 };
  const crop = selfieCrop(2048, 1536, guide)!;
  assert.deepEqual([crop.width, crop.height], [1152, 1536]);
  assert.ok(Math.abs(crop.width / crop.height - 0.75) < 0.001);
  // Centred on the guide, which stays inside the crop and in the same place across it.
  const f = cropFraming(guide, 2048, 1536, crop);
  assert.ok(Math.abs(f.x + f.width / 2 - 0.5) < 0.01);
  assert.ok(f.x >= 0 && f.x + f.width <= 1);
});

test("an iPhone selfie is already 3:4 and left alone; a taller photo loses only top and bottom", () => {
  assert.equal(selfieCrop(1536, 2048), null);
  const tall = selfieCrop(1152, 2048)!;
  assert.deepEqual([tall.x, tall.width, tall.height], [0, 1152, 1536]);
  // Off-centre guides are kept inside the photo.
  const edge = selfieCrop(2048, 1536, { x: 0.9, y: 0.5, width: 0.1, height: 0.1 })!;
  assert.equal(edge.x + edge.width, 2048);
});

test("the crop centres on the patient's face when it is found, even off the guide", () => {
  // Patient standing left of centre, guide in the middle.
  const crop = selfieCrop(2048, 1536, { x: 0.4, y: 0.55, width: 0.2, height: 0.15 }, { x: 700, y: 760 })!;
  assert.equal(crop.x + crop.width / 2, 700);
  // A face near the edge keeps the crop inside the photo.
  assert.equal(selfieCrop(2048, 1536, undefined, { x: 100, y: 700 })!.x, 0);
  const points = Array.from({ length: 478 }, (_, i) => [600 + (i % 2) * 200, 500 + (i % 3) * 150] as [number, number]);
  assert.deepEqual(faceCentre(points), { x: 700, y: 650 });
  assert.equal(faceCentre(points.slice(0, 100)), null);
});
