import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { activateWorkspace, captureWorkspace, legacyWorkspace, guardStore, WorkspaceChangedError, onWorkspaceDetach, workspaceDatabase } from "../src/lib/workspace";
import { createCaseRepository, getCaseRepository } from "../src/services/cases/caseRepository";
import { createCaseLogStore } from "../src/lib/caseLog";
import { createDraftStore } from "../src/lib/storage";
import { createLibraryStore } from "../src/lib/caseLibrary";
import { createValidationStore } from "../src/lib/validation";
import { listLegacyCases, importLegacyCases } from "../src/services/cases/legacyImport";
import { deleteDatabase, deleteAllCases, deleteWorkspaceData } from "../src/lib/localData";
import { buildDataExport } from "../src/lib/dataExport";
import { clearToothDebugCache, rememberToothDebug, toothDebugFor, rememberRoughMap, roughMapFor } from "../src/lib/toothMap/debug";
import { defaultSettings, type CaseLogEntry, type CaseLogMedia, type SmileCase } from "../src/lib/types";
import { initialReportDraft } from "../src/lib/consultation";
import type { ToothMap } from "../src/lib/toothMap/types";
const makeTemplateMap = (photoId: string): ToothMap => ({ photoId, arch: "upper", teeth: [], confirmedByClinician: false, version: 1, method: "manual" });

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const entry = (id: string, caseId = id, sample = false): CaseLogEntry => ({ id, caseId, patientName: id, createdAt: 1, mode: sample ? "mock" : "live", testMode: sample, thumb: `${png}#${id}`, summary: "Layered composite", favourite: true,
  exports: [{ kind: "report", createdAt: 2, draft: initialReportDraft({ settings: defaultSettings, analysis: null, patientLabel: id, now: new Date(0) }) }] });
const media = (id: string): CaseLogMedia => ({ id, image: png, originalImage: png, preferences: { settings: defaultSettings }, review: { reviewer: "Clinician", notes: "Keep natural proportions", reviewedAt: 3 } });
const draft = (id: string): SmileCase => ({ caseId: id, patientName: id, photo: { name: "photo.png", width: 100, height: 100, dataUrl: png }, settings: defaultSettings, screen: "design", result: null, variants: [] });
const account = (id: string) => createCaseRepository(activateWorkspace({ kind: "account", userId: id }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

// Every test owns a clean simulated browser origin; no automatic legacy account assignment.
test.beforeEach(() => { activateWorkspace({ kind: "unowned" }); globalThis.indexedDB = new IDBFactory(); clearToothDebugCache(); });

test("A → sign out → B → A isolates cases, thumbnails, media, reviews, report drafts and current photo", async () => {
  const a = account("A"); await a.recordVisualisation(entry("a-version", "a-case"), media("a-version"));
  const saved = draft("a-case");
  saved.photo.toothMap = makeTemplateMap("photo-id");
  await a.persistCase(saved);
  assert.equal((await a.listCases()).length, 1);
  activateWorkspace({ kind: "unowned" });
  const signedOut = getCaseRepository();
  assert.deepEqual(await signedOut.listCases(), []); assert.equal(await signedOut.readCase(), null);
  await assert.rejects(a.readLogMedia("a-version"), WorkspaceChangedError);
  const b = account("B");
  assert.deepEqual(await b.listActiveLog(), []); assert.equal(await b.getCase("a-case"), null);
  assert.equal(await b.readLogMedia("a-version"), null); assert.equal(await b.readCase(), null);
  const exported = await buildDataExport(null, b.scope);
  assert.deepEqual(exported.device.cases, []); assert.equal(exported.device.currentCase, null);
  await b.recordVisualisation(entry("b-version"), media("b-version"));
  const returned = account("A");
  assert.equal((await returned.listLog())[0].thumb, entry("a-version").thumb);
  assert.deepEqual(await returned.readLogMedia("a-version"), media("a-version"));
  assert.deepEqual(await returned.readCase(), saved);
  assert.deepEqual((await returned.listLog())[0].exports, entry("a-version").exports);
  assert.equal(await returned.readLogMedia("b-version"), null);
});

test("a repository captured by A rejects late reads and writes even after A signs back in", async () => {
  const a = account("A"); await a.recordVisualisation(entry("a"), media("a"));
  const read = a.getCase("a");
  const rejected = assert.rejects(read, WorkspaceChangedError);
  account("B"); await rejected;
  const returned = account("A");
  await assert.rejects(a.recordVisualisation(entry("late"), media("late")), WorkspaceChangedError);
  assert.equal(await returned.readLogMedia("late"), null);
});

test("queued A draft saves cannot become B drafts or resurrect after a session change", async () => {
  const a = account("A"); const write = a.persistCase(draft("queued-a"));
  const rejected = assert.rejects(write, WorkspaceChangedError);
  const b = account("B"); await rejected; assert.equal(await b.readCase(), null);
  assert.equal(await account("A").readCase(), null);
});

test("a late account-specific reference listing cannot populate the incoming session", async () => {
  const a = account("A"); const response = deferred<string[]>();
  const loader = guardStore(a.scope, { async refresh() { return response.promise; } });
  let visible: string[] = [];
  const load = loader.refresh().then(items => { visible = items; });
  const rejected = assert.rejects(load, WorkspaceChangedError);
  account("B"); response.resolve(["A-private-thumbnail", "A-signed-link"]); await rejected;
  assert.deepEqual(visible, []);
});

test("account switch aborts sensitive work, clears memory, and preserves the account cache", async () => {
  const a = account("A"); await a.persistCase(draft("kept"));
  let cleared = 0; const remove = onWorkspaceDetach(() => { cleared++; });
  const map = makeTemplateMap("A-photo"); rememberRoughMap(map); rememberToothDebug(png, { mask: "patient mask" });
  account("B"); assert.equal(a.scope.signal.aborted, true); assert.equal(cleared, 1);
  assert.equal(toothDebugFor(png), undefined); assert.equal(roughMapFor(map.photoId), undefined); remove();
  assert.equal((await account("A").readCase())?.caseId, "kept");
});

test("legacy saved cases and a photo-only draft are never automatically assigned", async () => {
  const legacy = legacyWorkspace(); await createCaseLogStore(legacy).addLogEntry(entry("old"), media("old"));
  await createDraftStore(legacy).persistCase(draft("photo-only"));
  const a = account("A"); assert.deepEqual(await a.listCases(), []); assert.equal(await a.readCase(), null);
  const choices = await listLegacyCases(a.scope);
  assert.deepEqual(choices.map(c => c.caseId).sort(), ["old", "photo-only"]);
  assert.equal((await createCaseLogStore(legacyWorkspace()).listLog()).length, 1);
});

test("explicit selected-only import preserves IDs, media, settings, review, favourite and report history", async () => {
  const legacy = createCaseLogStore(legacyWorkspace());
  await legacy.addLogEntry(entry("one-v1", "one"), media("one-v1"));
  await legacy.addLogEntry(entry("one-v2", "one"), media("one-v2"));
  await legacy.addLogEntry(entry("other"), media("other"));
  const a = account("A"); const choices = await listLegacyCases(a.scope);
  await importLegacyCases([choices.find(c => c.caseId === "one")!.key], a.scope);
  assert.equal((await a.listCases()).length, 1); assert.equal((await a.listLog()).length, 2);
  const saved = (await a.listLog()).find(e => e.id === "one-v1")!;
  for (const key of ["id", "caseId", "favourite", "exports"] as const) assert.deepEqual(saved[key], entry("one-v1", "one")[key]);
  assert.deepEqual(await a.readLogMedia("one-v1"), media("one-v1")); assert.equal(await a.readLogMedia("other"), null);
  assert.equal((await createCaseLogStore(legacyWorkspace()).listLog()).length, 3);
});

test("interrupted import resumes safely and repeated import does not duplicate or overwrite edited copies", async () => {
  const legacy = createCaseLogStore(legacyWorkspace());
  await legacy.addLogEntry(entry("first", "group"), media("first"));
  await legacy.addLogEntry(entry("second", "group"), media("second"));
  const a = account("A"); const [choice] = await listLegacyCases(a.scope);
  // A missing second image interrupts after the first atomic version transaction.
  const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open("smile-case-log", 1); req.onsuccess = () => resolve(req.result); });
  await new Promise<void>(resolve => { const tx = db.transaction("media", "readwrite"); tx.objectStore("media").delete("second"); tx.oncomplete = () => resolve(); }); db.close();
  await assert.rejects(importLegacyCases([choice.key], a.scope), /missing/);
  assert.equal((await a.listLog()).length, 1);
  await legacyForCurrent().addLogEntry(entry("second", "group"), media("second"));
  await importLegacyCases([choice.key], a.scope); await a.renameCase("group", "Edited locally"); await a.setFavourite("first", false);
  await importLegacyCases([choice.key, choice.key], a.scope);
  assert.equal((await a.listLog()).length, 2); assert.equal((await a.listLog())[0].patientName, "Edited locally");
  assert.equal((await a.listLog()).find(e => e.id === "first")?.favourite, undefined);
  await a.deleteLogEntry("first"); await importLegacyCases([choice.key], a.scope);
  assert.equal(await a.readLogMedia("first"), null); // don't resurrect a deleted imported version
});
function legacyForCurrent() { return createCaseLogStore(legacyWorkspace()); }

test("migration aborts on account switch and originals remain recoverable", async () => {
  await legacyForCurrent().addLogEntry(entry("old"), media("old"));
  const a = account("A"); const choices = await listLegacyCases(a.scope);
  const pending = importLegacyCases([choices[0].key], a.scope); const rejected = assert.rejects(pending, WorkspaceChangedError);
  const b = account("B"); await rejected; assert.deepEqual(await b.listCases(), []);
  assert.equal((await legacyForCurrent().listLog())[0].id, "old");
});

test("demo/sample cases are excluded even when explicitly included in an import request", async () => {
  await legacyForCurrent().addLogEntry(entry("sample", "sample", true), media("sample"));
  const a = account("A"); const choices = await listLegacyCases(a.scope); assert.equal(choices[0].sample, true);
  assert.equal(await importLegacyCases(choices.map(c => c.key), a.scope), 0);
  await a.recordVisualisation(entry("demo", "demo", true), media("demo"));
  await a.persistCase({ ...draft("demo"), testMode: true, testPreview: png });
  assert.deepEqual(await a.listCases(), []); assert.equal(await a.readCase(), null);
});

test("photo-only legacy draft preserves its design and does not overwrite an incoming account's draft", async () => {
  const old = draft("photo-only"); old.settings = { ...defaultSettings, targetShade: "Bleach" };
  await createDraftStore(legacyWorkspace()).persistCase(old);
  const a = account("A"); const [choice] = await listLegacyCases(a.scope);
  await a.persistCase(draft("current"));
  await assert.rejects(importLegacyCases([choice.key], a.scope), /already has a current draft/);
  assert.equal((await a.readCase())?.caseId, "current");
  await a.persistCase(null); await importLegacyCases([choice.key], a.scope); assert.deepEqual(await a.readCase(), old);
  await a.persistCase({ ...old, patientName: "Edited" }); await importLegacyCases([choice.key], a.scope);
  assert.equal((await a.readCase())?.patientName, "Edited");
});

test("ID collisions stop migration without overwriting data", async () => {
  await legacyForCurrent().addLogEntry(entry("same"), media("same"));
  const a = account("A"); await a.recordVisualisation({ ...entry("same"), patientName: "Account copy" }, media("same"));
  const [choice] = await listLegacyCases(a.scope); await assert.rejects(importLegacyCases([choice.key], a.scope), /Nothing was overwritten/);
  assert.equal((await a.listLog())[0].patientName, "Account copy");
});

test("new unowned cases also require explicit import, and signed-out migration is forbidden", async () => {
  await getCaseRepository().recordVisualisation(entry("unsigned"), media("unsigned"));
  await assert.rejects(listLegacyCases(), /Sign in/);
  const a = account("A"); assert.deepEqual(await a.listCases(), []);
  const [choice] = await listLegacyCases(a.scope); assert.equal(choice.caseId, "unsigned");
  await importLegacyCases([choice.key], a.scope); assert.equal((await a.listLog())[0].id, "unsigned");
});

test("device reference media and validation scores remain isolated and references are not patient imports", async () => {
  const a = account("A");
  await createLibraryStore(a.scope).addLibraryCase({ id: "reference", material: "Layered composite", label: "Own reference", addedAt: 1 }, { id: "reference", image: png, thumb: png });
  await createValidationStore(a.scope).saveValidationRecord({ id: "score", caseId: "reference", variationId: "v", createdAt: 1, reviewer: "Clinician", notes: "Private", settings: defaultSettings, scores: { "Tooth contours": 4, "Gums preserved": 4, "Untreated teeth preserved": 4, "Material appearance": 4 } });
  const b = account("B"); assert.deepEqual(await createLibraryStore(b.scope).listLibrary(), []); assert.equal(await createLibraryStore(b.scope).readLibraryMedia("reference"), null);
  assert.deepEqual(await createValidationStore(b.scope).validationRecords(), []); assert.deepEqual(await listLegacyCases(b.scope), []);
  const returned = account("A"); assert.equal((await createLibraryStore(returned.scope).listLibrary()).length, 1);
});

test("blocked database deletion stays pending until the connection closes", async () => {
  const factory = new IDBFactory(); const db = await new Promise<IDBDatabase>(resolve => { const req = factory.open("blocked", 1); req.onsuccess = () => resolve(req.result); });
  const blocked = deferred<void>(); db.onversionchange = () => blocked.resolve();
  let finished = false; const deletion = deleteDatabase("blocked", factory).then(() => { finished = true; });
  await blocked.promise; await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(finished, false);
  db.close(); await deletion; assert.equal(finished, true); assert.deepEqual(await factory.databases(), []);
});

test("database deletion failures reject instead of claiming successful reset", async () => {
  const request = {} as IDBOpenDBRequest;
  const factory = { deleteDatabase() { queueMicrotask(() => { Object.defineProperty(request, "error", { value: new Error("delete failed") }); request.onerror?.({} as Event); }); return request; } } as unknown as IDBFactory;
  await assert.rejects(deleteDatabase("failure", factory), /delete failed/);
});

test("deleting this account's cases leaves other account cases and reference library intact", async () => {
  const a = account("A"); await a.recordVisualisation(entry("a"), media("a")); await a.persistCase(draft("a"));
  const b = account("B"); await b.recordVisualisation(entry("b"), media("b"));
  await createLibraryStore(b.scope).addLibraryCase({ id: "ref", material: "Porcelain", label: "Ref", addedAt: 1 }, { id: "ref", image: png, thumb: png });
  await deleteAllCases(indexedDB, b.scope);
  const bNew = getCaseRepository(); assert.deepEqual(await bNew.listCases(), []); assert.equal((await createLibraryStore(bNew.scope).listLibrary()).length, 1);
  assert.equal((await account("A").listCases()).length, 1);
});

test("account deletion cache cleanup targets only the bound account and legacy data is kept", async () => {
  await legacyForCurrent().addLogEntry(entry("legacy"), media("legacy"));
  await account("A").recordVisualisation(entry("a"), media("a"));
  const b = account("B"); await b.recordVisualisation(entry("b"), media("b")); await deleteWorkspaceData(b.scope);
  assert.deepEqual(await getCaseRepository().listCases(), []);
  assert.equal((await account("A").listCases()).length, 1); assert.equal((await legacyForCurrent().listLog()).length, 1);
  assert.equal(workspaceDatabase("smile-case-log", captureWorkspace()), "smile-case-log:v1:account:A");
});
