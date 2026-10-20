import { test } from "node:test";
import assert from "node:assert/strict";
import { foldFrom, sideBarFrom } from "../src/native/sideBar";

// What the iPhone Duo simulator reports with the device open in landscape (951 × 669 points).
const openLandscape = { edge: "right" as const, inset: 84, x: 881, y: 120, width: 44, height: 515, viewWidth: 951, viewHeight: 669 };

test("the side bar is read from what the system reports", () => {
  assert.deepEqual(sideBarFrom(openLandscape), {
    edge: "right", inset: 84, rail: { x: 881, y: 120, width: 44, height: 515 }, view: { width: 951, height: 669 }, fold: null,
  });
  const fold = { x: 455.5, y: 0, width: 40, height: 669 };
  assert.deepEqual(sideBarFrom({ ...openLandscape, fold })?.fold, fold);
});

test("no side bar unless the system has one with room for controls", () => {
  assert.equal(sideBarFrom(null), null);
  assert.equal(sideBarFrom({ edge: "none", viewWidth: 669, viewHeight: 951 }), null);
  // Incomplete or implausible geometry never moves the app's controls.
  assert.equal(sideBarFrom({ edge: "right", inset: 84 }), null);
  assert.equal(sideBarFrom({ ...openLandscape, width: 0 }), null);
  assert.equal(sideBarFrom({ ...openLandscape, height: 40 }), null);
  assert.equal(sideBarFrom({ ...openLandscape, inset: 20 }), null);
  assert.equal(sideBarFrom({ ...openLandscape, x: Number.NaN }), null);
});

test("the fold is read in every pose, with or without a side bar", () => {
  // Open and upright, partly folded: no side bar, the fold runs across the middle.
  const upright = { edge: "none" as const, viewWidth: 669, viewHeight: 951, fold: { x: 0, y: 455.5, width: 669, height: 40 } };
  assert.equal(sideBarFrom(upright), null);
  assert.deepEqual(foldFrom(upright), { x: 0, y: 455.5, width: 669, height: 40, axis: "horizontal" });
  assert.equal(foldFrom({ ...openLandscape, fold: { x: 455.5, y: 0, width: 40, height: 669 } })?.axis, "vertical");
  assert.equal(foldFrom(openLandscape), null);
  assert.equal(foldFrom({ ...upright, fold: { x: 0, y: Number.NaN, width: 669, height: 40 } }), null);
});
