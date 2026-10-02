import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("tooth selection copy distinguishes AI instructions from reviewed boundary protection", () => {
  const chart = readFileSync("src/components/ToothChart.tsx", "utf8");
  const studio = readFileSync("src/components/studio/DesignStudio.tsx", "utf8");
  assert.doesNotMatch(chart, /Unselected and missing teeth stay unchanged/);
  assert.doesNotMatch(studio, /Other teeth stay original\./);
  assert.match(chart, /instructed to preserve/);
  assert.match(studio, /confirmed boundaries/);
});
