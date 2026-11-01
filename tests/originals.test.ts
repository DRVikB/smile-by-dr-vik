import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOriginalStore, holdOriginal, originalFileName, takeHeldOriginal } from "../src/lib/originals";
import { deleteAllLocalData, LOCAL_DATABASES } from "../src/lib/localData";
import { captureWorkspace } from "../src/lib/workspace";

const photo = (bytes: number, type = "image/jpeg") => new Blob([new Uint8Array(bytes).fill(7)], { type });

test("a held original is handed over once, and only the last few photos read are kept waiting", () => {
  const token = holdOriginal(photo(10), "IMG_0001.HEIC");
  assert.equal(takeHeldOriginal(token)?.name, "IMG_0001.HEIC");
  assert.equal(takeHeldOriginal(token), null, "a second take finds nothing");
  assert.equal(takeHeldOriginal(undefined), null);
  const tokens = Array.from({ length: 6 }, (_, i) => holdOriginal(photo(1), `p${i}.jpg`));
  assert.equal(takeHeldOriginal(tokens[0]), null, "the oldest are dropped");
  assert.equal(takeHeldOriginal(tokens[5])?.name, "p5.jpg");
});

test("an original's file name keeps its own extension and says what it is", () => {
  assert.equal(originalFileName({ name: "IMG_0001.HEIC", type: "image/heic", role: "design" }, "Jane Smith · veneers"), "jane-smith-veneers-photo-original.heic");
  assert.equal(originalFileName({ name: "patient-photo.jpeg", type: "image/jpeg", role: "photo-set:retracted-front" }), "retracted-front-original.jpg");
  assert.equal(originalFileName({ name: "photo", type: "image/png", role: "design" }), "photo-original.png");
});

test("originals are kept full size by case, a retaken view replaces its own, and they go with their case", async () => {
  const store = createOriginalStore(captureWorkspace());
  const big = photo(3_000_000);
  const design = await store.save({ caseId: "case-a", role: "design", blob: big, name: "IMG_0002.JPG" });
  assert.equal(design.bytes, 3_000_000, "the file is stored as it came, not scaled or re-encoded");
  const kept = await store.get(design.id);
  assert.equal(kept?.blob.size, 3_000_000);
  assert.equal(kept?.type, "image/jpeg");

  await store.save({ caseId: "case-a", role: "photo-set:front", blob: photo(5), name: "front-1.jpg", replace: true });
  await store.save({ caseId: "case-a", role: "photo-set:front", blob: photo(6), name: "front-2.jpg", replace: true });
  await store.save({ caseId: "case-b", role: "design", blob: photo(7), name: "other.jpg" });
  const caseA = await store.list("case-a");
  assert.equal(caseA.filter(o => o.role === "photo-set:front").length, 1, "a retaken view keeps only its newest original");
  assert.equal((await store.latest("case-a", "photo-set:front"))?.name, "front-2.jpg");
  assert.ok(caseA.every(o => !("blob" in o)), "listing never loads the files");

  await store.removeRole("case-a", "photo-set:front");
  assert.equal(await store.latest("case-a", "photo-set:front"), null);
  await store.removeCase("case-a");
  assert.deepEqual(await store.list("case-a"), []);
  assert.equal((await store.list("case-b")).length, 1, "other cases keep theirs");

  assert.equal(await store.prune(new Set(["case-c"])), 1, "originals of cases no longer on the device are dropped");
  assert.deepEqual(await store.list("case-b"), []);
});

test("erasing the device's data erases the originals too", async () => {
  assert.ok(LOCAL_DATABASES.includes("smile-originals"));
  const store = createOriginalStore(captureWorkspace());
  await store.save({ caseId: "case-z", role: "design", blob: photo(9), name: "z.jpg" });
  await deleteAllLocalData(indexedDB, null);
  assert.deepEqual(await createOriginalStore(captureWorkspace()).list("case-z"), []);
});
