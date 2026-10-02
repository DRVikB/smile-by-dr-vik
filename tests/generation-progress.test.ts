import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationState } from "../src/components/GenerationState";

test("generation wait does not present elapsed time as completed provider work", () => {
  const html = renderToStaticMarkup(createElement(GenerationState, { photo: "sample", testMode: false, onCancel() {} }));
  assert.doesNotMatch(html, /aria-valuenow|aria-valuemax|is-done/);
  assert.match(html, /aria-label="Cancel generation"/);
  assert.match(html, /role="status"/);
});
