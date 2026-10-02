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
