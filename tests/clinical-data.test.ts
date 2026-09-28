import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/lib/types";
import { settingsSchema } from "../src/lib/generation/schema";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { clinicalDataInstruction } from "../src/lib/generation/clinicalData";
import { preferenceRows } from "../src/lib/report";
import { previewFingerprint } from "../src/lib/generation/requestPolicy";

test("clinical data distinguishes zero, negative and absent measurements", () => {
  const settings = { ...defaultSettings, clinicalData: { overbiteMm: 0, overjetMm: -2 } };
  assert.equal(settingsSchema.safeParse(settings).success, true);
  assert.match(clinicalDataInstruction(settings), /Measured overbite: 0 mm/);
  assert.match(clinicalDataInstruction(settings), /Measured overjet: -2 mm/);
  assert.doesNotMatch(clinicalDataInstruction(defaultSettings), /Measured overbite:/);
  assert.equal(Object.fromEntries(preferenceRows(settings))["Measured overbite (clinician entered)"], "0 mm");
  for (const overbiteMm of [NaN, Infinity, 21]) assert.equal(settingsSchema.safeParse({ ...defaultSettings, clinicalData: { overbiteMm } }).success, false);
});

test("space restrictions outrank shape and length requests without authorising bite correction", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, designIntent: "Reshape", notes: "Lengthen 11 and 21", clinicalData: { restorativeSpace: "Limited / uncertain", constraints: "No posterior additions", patientPriorities: "Bigger smile" } });
  assert.match(prompt, /\(1\).*clinician-supplied restrictions/);
  assert.match(prompt, /SPACE RESTRICTION: Do not add incisal length or posterior height/);
  assert.match(prompt, /Clinical constraints: "No posterior additions"/);
  assert.match(prompt, /Patient priorities \(subordinate to clinical constraints\): "Bigger smile"/);
  assert.match(prompt, /do not invent intrusion, extrusion, jaw opening/);
});

test("photo review avoids inventing improvements and adds no measured values", () => {
  const prompt = clinicalDataInstruction(defaultSettings);
  assert.match(prompt, /Preserve features already balanced/);
  assert.match(prompt, /shade alone or very little visible change/);
  assert.doesNotMatch(prompt, /CLINICIAN DATA/);
});

test("changing clinician facts prevents reuse of a result made with different constraints", async () => {
  const original = await previewFingerprint(defaultSettings);
  const updated = await previewFingerprint({ ...defaultSettings, clinicalData: { overbiteMm: 5 } });
  assert.notEqual(original, updated);
});
