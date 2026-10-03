import test from "node:test";
import assert from "node:assert/strict";
import type { Point } from "../src/lib/face/geometry";

const source = { dataUrl: "approved-local-fixture" };
async function subject() { return import("../src/lib/generation/sourceProtection"); }

test("mouth-only source without an area requests boundary review before any provider call", async () => {
  const { sourceProtectionPoints, EditAreaRequiredError } = await subject();
  let providerCalls = 0;
  await assert.rejects(async () => {
    await sourceProtectionPoints(source, false, async () => null);
    providerCalls++;
  }, error => error instanceof EditAreaRequiredError && error.code === "edit_area_required");
  assert.equal(providerCalls, 0);
});

test("a reviewed area lets a close-up continue without requiring facial landmarks", async () => {
  const { sourceProtectionPoints } = await subject();
  let detections = 0;
  const points = await sourceProtectionPoints({ ...source, editMask: "reviewed-local-mask" }, false, async () => { detections++; return null; });
  assert.equal(points, null); assert.equal(detections, 0);
});

test("existing precise protection and full-face landmarks retain their paths", async () => {
  const { sourceProtectionPoints } = await subject();
  const face: Point[] = [[1, 2]];
  assert.equal(await sourceProtectionPoints(source, false, async () => face), face);
  assert.equal(await sourceProtectionPoints(source, true, async () => { throw Error("must not run"); }), null);
});

test("cancelled protection preflight does not open boundary recovery or send an image", async () => {
  const { sourceProtectionPoints, EditAreaRequiredError } = await subject();
  const controller = new AbortController();
  await assert.rejects(sourceProtectionPoints(source, false, async () => { controller.abort(); return null; }, controller.signal), error => error instanceof Error && error.name === "AbortError" && !(error instanceof EditAreaRequiredError));
});
