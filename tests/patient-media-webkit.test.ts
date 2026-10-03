import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createPatientLocalStore } from "../src/services/cases/sync/localStore";
import { createSyncCoordinator } from "../src/services/cases/sync/coordinator";
import { lease, A } from "./fixtures/patient-sync";
import { assetPath, type PatientAsset } from "../src/services/cases/sync/types";

test("local media remains readable when WebKit invalidates an old Blob handle on cache update", async () => {
  const scope = lease(A), cache = createPatientLocalStore(scope, new IDBFactory());
  const caseId = crypto.randomUUID(), id = crypto.randomUUID();
  const meta: PatientAsset = { id, caseId, ownerUserId: A, kind: "GENERATED_CONCEPT", objectPath: assetPath(A, caseId, id, "GENERATED_CONCEPT"), mimeType: "image/png", width: 1, height: 1, byteSize: 3, checksum: "a".repeat(64), provenance: "generated", createdAt: new Date().toISOString(), uploadStatus: "pending" };
  const original = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  let invalidated = false;
  const read = original.arrayBuffer.bind(original);
  original.arrayBuffer = async () => { if (invalidated) throw new DOMException("The object can not be found here.", "NotFoundError"); return read(); };
  await cache.putAsset({ id, meta, blob: original, pending: true, lastAccess: 0 });
  const store = { ...cache, asset: async () => ({ id, meta, blob: original, pending: true, lastAccess: 0 }), putAsset: async (asset: Parameters<typeof cache.putAsset>[0]) => { await cache.putAsset(asset); invalidated = true; } };
  const sync = createSyncCoordinator(scope, store, () => {}, async () => {});
  const delivered = await sync.loadAsset(caseId, id);
  assert.deepEqual([...new Uint8Array(await delivered.arrayBuffer())], [1, 2, 3]);
  assert.equal(delivered.type, "image/png");
  assert.equal((await cache.asset(id))?.pending, true, "Reading local media must not mark upload acknowledged");
  sync.disconnect();
});
