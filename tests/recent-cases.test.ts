import test from "node:test";
import assert from "node:assert/strict";
import { recentCasePages } from "../src/lib/recentCases";
import { savedCaseExport } from "../src/lib/savedCaseExport";
import { AI_CONCEPT_DISCLAIMER } from "../src/lib/brand";
import { PREVIEW_DISCLAIMER, REPORT_DISCLAIMER } from "../src/lib/consultation";
import { AI_TAG } from "../src/lib/aiTag";
import { defaultSettings, type CaseLogEntry } from "../src/lib/types";

const entry = (id: string, createdAt: number, extra: Partial<CaseLogEntry> = {}): CaseLogEntry => ({
  id, createdAt, patientName: id, mode: "live", summary: "", thumb: id, ...extra,
});

test("recent pages expose every case in activity order and preserve favourite covers", () => {
  const entries = Array.from({ length: 7 }, (_, i) => entry(`c${i}`, i));
  entries.push(entry("older-favourite", -1, { caseId: "group", favourite: true, patientName: "AB" }));
  entries.push(entry("newer-version", 10, { caseId: "group", patientName: "" }));
  const pages = recentCasePages(entries);
  assert.deepEqual(pages.map(page => page.length), [3, 3, 2]);
  assert.deepEqual(pages.flat().map(e => e.id), ["older-favourite", "c6", "c5", "c4", "c3", "c2", "c1", "c0"]);
  assert.equal(pages[0][0].createdAt, 10);
  assert.equal(pages[0][0].patientName, "AB");
  assert.equal(pages[0][0].versions, 2);
  assert.equal(entries[0].id, "c0", "sorting does not mutate the persisted list");
  assert.deepEqual(recentCasePages([]), []);
});

test("saved exports retain that version's photos, material and clinical preferences; legacy settings remain unknown", () => {
  const settings = { ...defaultSettings, treatment: "Porcelain" as const, clinicalData: { overbiteMm: 5 } };
  const saved = entry("v1", 1, { patientName: "AB" });
  const media = { id: "v1", originalImage: "original", image: "approved-concept", preferences: { settings, referenceUsed: true } };
  assert.deepEqual(savedCaseExport(saved, media), {
    before: "original", after: "approved-concept", settings, referenceUsed: true, isDemo: false, patientLabel: "AB",
  });
  const legacy = savedCaseExport(saved, { id: "v1", originalImage: "before", image: "after" });
  assert.equal(legacy.settings, undefined);
  assert.equal(legacy.referenceUsed, undefined);
  assert.equal(savedCaseExport({ ...saved, testMode: true }, media).isDemo, true);
  assert.equal(savedCaseExport({ ...saved, mode: "mock" }, media).isDemo, true);
});

test("patient exports consistently disclose AI and clinician design without guaranteeing treatment", () => {
  assert.equal(AI_TAG, "AI concept");
  assert.equal(PREVIEW_DISCLAIMER, AI_CONCEPT_DISCLAIMER);
  assert.equal(REPORT_DISCLAIMER, AI_CONCEPT_DISCLAIMER);
  assert.match(AI_CONCEPT_DISCLAIMER, /AI-generated/);
  assert.match(AI_CONCEPT_DISCLAIMER, /clinician’s chosen smile design/);
  assert.match(AI_CONCEPT_DISCLAIMER, /visual guide/);
  assert.match(AI_CONCEPT_DISCLAIMER, /not a guarantee of the final clinical outcome/);
});
