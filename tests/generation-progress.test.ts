import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationState } from "../src/components/GenerationState";
import { visibleGenerationStep, earliestGenerationStage } from "../src/lib/generation/progress";

test("generation wait does not present elapsed time as completed provider work", () => {
  const html = renderToStaticMarkup(createElement(GenerationState, { photo: "sample", testMode: false, onCancel() {} }));
  assert.doesNotMatch(html, /aria-valuenow|aria-valuemax|is-done/);
  assert.match(html, /aria-label="Cancel generation"/);
  assert.match(html, /role="status"/);
});

test("timed steps never claim that an unfinished provider request has reached protection", () => {
  assert.equal(visibleGenerationStep(90000, "preflight", false), 0);
  assert.equal(visibleGenerationStep(90000, "request", false), 1);
  assert.equal(visibleGenerationStep(90000, "response", false), 1);
  assert.equal(visibleGenerationStep(90000, "mouth_composite", false), 2);
  assert.equal(visibleGenerationStep(90000, "quality_check", false), 3);
});

test("timed presentation paces rapid transitions without changing pipeline progress", () => {
  assert.equal(visibleGenerationStep(100, "request", false), 0);
  assert.equal(visibleGenerationStep(2600, "request", false), 1);
  assert.equal(visibleGenerationStep(7000, "quality_check", false), 2);
  assert.equal(visibleGenerationStep(13000, "quality_check", false), 3);
  assert.equal(visibleGenerationStep(900, "complete", true), 2);
});

test("a batch tracks its least advanced concept, not the most recent callback", () => {
  assert.equal(earliestGenerationStage(["complete", "request", "mouth_composite"]), "request");
  assert.equal(earliestGenerationStage(["prepare_image", "complete"]), "prepare_image");
  assert.equal(earliestGenerationStage([]), "preflight");
});
