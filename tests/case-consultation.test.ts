import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PATIENT_WORDS_LIMIT, displayWords, goalsSummary, normaliseConsultation, updateConsultation } from "../src/lib/caseConsultation";
import { validStructured } from "../src/server/patientCaseHandlers";
import { generationSchema } from "../src/lib/generation/schema";
import { defaultSettings } from "../src/lib/types";

test("legacy, malformed or empty consultation data reads as none; nothing is invented", () => {
  for (const value of [undefined, null, "goals", [], {}, { schemaVersion: 2, patientGoals: ["Colour"] }, { schemaVersion: 1, patientGoals: [], patientWords: "   " }])
    assert.equal(normaliseConsultation(value), undefined);
  const read = normaliseConsultation({ schemaVersion: 1, patientGoals: ["Gaps", "Unknown", "Colour"], updatedAt: 5 });
  assert.deepEqual(read, { schemaVersion: 1, patientGoals: ["Colour", "Gaps"], updatedAt: 5 }, "unknown goals dropped, order stable");
});

test("goals toggle and clear; clearing everything removes the record", () => {
  const one = updateConsultation(undefined, { patientGoals: ["Colour"] }, 10)!;
  assert.deepEqual(one.patientGoals, ["Colour"]);
  const words = updateConsultation(one, { patientWords: "Brighter but natural" }, 11)!;
  assert.deepEqual([words.patientGoals, displayWords(words), words.updatedAt], [["Colour"], "Brighter but natural", 11]);
  assert.equal(updateConsultation(updateConsultation(words, { patientGoals: [] }), { patientWords: "" }), undefined);
  assert.equal(goalsSummary(words), "Colour");
  assert.equal(goalsSummary(updateConsultation(undefined, { patientWords: "Just whiter" })), "Patient’s words recorded");
  assert.equal(goalsSummary(undefined), null);
});

test("patient words are limited and stay syncable even when they start like a web address", () => {
  const long = updateConsultation(undefined, { patientWords: "x".repeat(PATIENT_WORDS_LIMIT + 50) })!;
  assert.equal(displayWords(long).length, PATIENT_WORDS_LIMIT);
  const url = updateConsultation(undefined, { patientWords: "https://example.com is the smile I like" })!;
  assert.equal(displayWords(url), "https://example.com is the smile I like");
  assert.equal(validStructured(url), true, "accepted by the synced case state");
  assert.equal(validStructured({ ...url, patientWords: "https://example.com" }), false, "the guard is what makes it accepted");
  assert.deepEqual(normaliseConsultation(url), url, "re-reading keeps a single guard");
});

test("consultation data never reaches the image service request", () => {
  const consultation = { schemaVersion: 1, patientGoals: ["Colour"], patientWords: "PRIVATE patient words" };
  const parsed = generationSchema.parse({ originalImage: `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`, settings: { ...defaultSettings, consultation }, consultation });
  assert.equal(JSON.stringify(parsed).includes("PRIVATE patient words"), false);
  const page = readFileSync("src/app/page.tsx", "utf8");
  const request = page.slice(page.indexOf("await generateSmileImage({"), page.indexOf("}, {", page.indexOf("await generateSmileImage({")));
  assert.doesNotMatch(request, /consultation/, "the app never adds it to the generation request");
});
