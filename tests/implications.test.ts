import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, upperTeeth } from "../src/lib/types";
import {
  CONFIRM_AT_ASSESSMENT,
  impliesWhitening,
  treatmentImplications,
} from "../src/lib/implications";

const titles = (s: Parameters<typeof treatmentImplications>[0], r?: Parameters<typeof treatmentImplications>[1]) =>
  treatmentImplications(s, r).items.map((i) => i.title);

test("the material decides the headline treatment", () => {
  assert.equal(titles(defaultSettings)[0], "Composite bonding on 8 upper teeth");
  assert.equal(
    titles({ ...defaultSettings, treatment: "Porcelain", teeth: 6, selectedTeeth: upperTeeth[6] })[0],
    "Porcelain veneers on 6 upper teeth",
  );
  const porcelain = treatmentImplications({ ...defaultSettings, treatment: "Porcelain" }).items[0];
  assert.match(porcelain.detail, /can’t be undone/);
});

test("premolars are only mentioned when they're treated", () => {
  assert.ok(titles(defaultSettings).includes("Includes the premolars"));
  assert.ok(!titles({ ...defaultSettings, teeth: 6, selectedTeeth: upperTeeth[6] }).includes("Includes the premolars"));
});

test("whitening is flagged only when the target is lighter than today", () => {
  assert.equal(impliesWhitening({ currentShade: "A2", targetShade: "The same" }), false);
  assert.equal(impliesWhitening({ currentShade: "A2", targetShade: "Whiten" }), true);
  assert.equal(impliesWhitening({ currentShade: "A3", targetShade: "A1" }), true);
  assert.equal(impliesWhitening({ currentShade: "B1", targetShade: "A1" }), false);
  assert.ok(!titles({ ...defaultSettings, targetShade: "The same" }).includes("Whitening first"));
});

test("intensity sets expectations at both ends, and the size check carries through", () => {
  assert.ok(titles({ ...defaultSettings, intensity: 80 }).includes("A bigger change in shape"));
  assert.ok(titles({ ...defaultSettings, intensity: 20 }).includes("A subtle refinement"));
  const mid = titles({ ...defaultSettings, intensity: 40 });
  assert.ok(!mid.includes("A bigger change in shape") && !mid.includes("A subtle refinement"));
  assert.ok(titles(defaultSettings, { scaleFlag: "grew" }).includes("Longer or larger than today"));
  assert.ok(!titles(defaultSettings, { scaleFlag: "ok" }).includes("Longer or larger than today"));
});

test("the assessment checklist is always there, including the gums", () => {
  const { confirm } = treatmentImplications(defaultSettings);
  assert.deepEqual(confirm, CONFIRM_AT_ASSESSMENT);
  assert.ok(confirm.some((c) => /gum/i.test(c)));
  assert.ok(confirm.some((c) => /bite/i.test(c)));
});
