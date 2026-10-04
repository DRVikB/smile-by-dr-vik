import test from "node:test";
import assert from "node:assert/strict";
import { UnvalidatedOutputStore, diagnosticViewingAllowed } from "../src/services/ai/unvalidatedOutput";

const source = "data:image/jpeg;base64,/9j/AA==";
const raw = "data:image/jpeg;base64,/9j/AQ==";
const decode = async () => ({ width: 896, height: 1200 });
const context = { caseId: "case-a", source };
test("private inspector captures any uploaded photo by default and remains enabled for the next case", async () => {
  const store = new UnvalidatedOutputStore(decode);
  for (const [caseId, original] of [["uploaded-a", source], ["uploaded-b", raw]]) {
    store.context({ caseId, source: original });
    const ticket = store.begin(caseId, original, () => true);
    assert.ok(ticket, "diagnostic capture should not require rechecking an opt-in or a fixture filename");
    await store.raw(ticket, raw);
    store.reject(ticket, { stage: "mouth_composite", reason: "generated_landmarks_missing" });
    assert.equal(store.snapshot()?.original, original);
    assert.equal(store.snapshot()?.raw, raw);
    assert.equal(store.snapshot()?.final, undefined);
    store.clear();
    assert.equal(store.snapshot(), null);
  }
});
test("private viewing requires explicit diagnostic staging/native build and allows opt-out", async () => {
  assert.equal(diagnosticViewingAllowed({ harness: "1", diagnostics: "1", native: true, staging: true }), true);
  for (const patch of [{ harness: "0" }, { diagnostics: "0" }, { native: false }, { staging: false }])
    assert.equal(diagnosticViewingAllowed({ harness: "1", diagnostics: "1", native: true, staging: true, ...patch }), false);
  const store = new UnvalidatedOutputStore(decode);
  store.context(context); store.enable(false); assert.equal(store.begin("request", source, () => true), null);
  store.enable(true); assert.ok(store.begin("request", source, () => true));
});
test("retain raw before rejected geometry; absent stages are never invented", async () => {
  const store = new UnvalidatedOutputStore(decode); store.context(context); store.enable(true);
  const ticket = store.begin("request", source, () => true)!;
  await store.raw(ticket, raw);
  store.reject(ticket, { stage: "align", reason: "aspect_ratio_mismatch" });
  assert.equal(store.snapshot()?.raw, raw); assert.equal(store.snapshot()?.normalized, undefined);
  assert.equal(store.snapshot()?.final, undefined); assert.equal(store.snapshot()?.reason, "aspect_ratio_mismatch");
});
test("missing generated landmarks remains a rejection with inspectable original/raw/normalised", async () => {
  const store = new UnvalidatedOutputStore(decode); store.context(context); store.enable(true);
  const ticket = store.begin("request", source, () => true)!;
  await store.raw(ticket, raw); store.normalized(ticket, source);
  store.reject(ticket, { stage: "mouth_composite", reason: "generated_landmarks_missing" });
  assert.equal(store.snapshot()?.original, source); assert.equal(store.snapshot()?.normalized, source);
  assert.equal(store.snapshot()?.rejected, true); assert.equal(store.snapshot()?.final, undefined);
});
test("invalid decode and excessive dimensions cannot enter diagnostic viewing", async () => {
  for (const decoder of [async () => { throw Error("decode"); }, async () => ({ width: 10000, height: 10000 })]) {
    const store = new UnvalidatedOutputStore(decoder); store.context(context); store.enable(true);
    const ticket = store.begin("request", source, () => true)!;
    assert.equal(await store.raw(ticket, raw), false); assert.equal(store.snapshot(), null);
  }
});
test("dismissal/source/account changes drop images and reject late asynchronous delivery", async () => {
  let finish!: (v: { width: number; height: number }) => void;
  const store = new UnvalidatedOutputStore(() => new Promise(resolve => { finish = resolve; }));
  store.context(context); store.enable(true); const ticket = store.begin("late", source, () => true)!;
  const pending = store.raw(ticket, raw); store.context({ ...context, source: raw }); finish({ width: 896, height: 1200 });
  assert.equal(await pending, false); assert.equal(store.snapshot(), null);
  store.clear(); assert.equal(store.snapshot(), null); store.enable(false); assert.equal(store.begin("other", source, () => true), null);
});
test("lease invalidation and expiration prevent stale cross-case images", async () => {
  let valid = true, now = 0;
  const store = new UnvalidatedOutputStore(decode, () => now); store.context(context); store.enable(true);
  const ticket = store.begin("request", source, () => valid)!; await store.raw(ticket, raw);
  valid = false; assert.equal(store.snapshot(), null);
  valid = true; const second = store.begin("second", source, () => valid)!; await store.raw(second, raw);
  now = 600001; assert.equal(store.snapshot(), null);
});
test("inspection does not invoke a provider, persist an image or mark a rejection successful", async () => {
  const store = new UnvalidatedOutputStore(decode); store.context(context); store.enable(true);
  const ticket = store.begin("request", source, () => true)!;
  await store.raw(ticket, raw); store.reject(ticket, { stage: "mouth_composite", reason: "generated_landmarks_missing" });
  assert.equal(store.snapshot()?.rejected, true); assert.equal(store.snapshot()?.final, undefined);
  store.clear(); assert.equal(store.snapshot(), null);
});
