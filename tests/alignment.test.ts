import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, type SmileSettings } from "../src/lib/types";
import { isNoChangeDesign } from "../src/lib/generation/designPlan";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema } from "../src/lib/generation/schema";
import { treatmentImplications } from "../src/lib/implications";
import { preferenceRows } from "../src/lib/report";

const aligned = (alignment: SmileSettings["alignment"], extra: Partial<SmileSettings> = {}): SmileSettings => ({ ...defaultSettings, alignment, ...extra });

test("alignment off leaves the protected-position instructions exactly as before", () => {
  const prompt = buildSmileInstruction(defaultSettings);
  assert.ok(!prompt.includes("ORTHODONTIC ALIGNMENT"));
  assert.match(prompt, /Preserve tooth positions, axes, rotations and arch form\./);
  assert.match(prompt, /never permits gum editing or tooth movement\./);
  assert.match(prompt, /they do not permit moving whole teeth or altering protected anatomy\.$/);
});

test("straightening both arches permits whole-tooth movement, including the lower teeth, and nothing more", () => {
  const settings = aligned({ arches: "Both" });
  assert.equal(settingsSchema.safeParse(settings).success, true);
  const prompt = buildSmileInstruction(settings);
  assert.match(prompt, /ORTHODONTIC ALIGNMENT CONCEPT \(upper and lower arches/);
  assert.match(prompt, /Align the lower incisors evenly/);
  assert.match(prompt, /do not reshape, resize, lengthen, recolour or resurface them for the alignment/);
  assert.match(prompt, /never close a missing-tooth space by drifting neighbours/);
  assert.match(prompt, /within the original lips and mouth opening/);
  assert.match(prompt, /Outside the ORTHODONTIC ALIGNMENT permission, preserve tooth positions/);
  assert.match(prompt, /may reposition \(never reshape or recolour\) the visible teeth of the upper and lower arches/);
  // Gums still never edited, midline still kept, the concept framing still first.
  assert.match(prompt, /Do not edit the gingiva/);
  assert.match(prompt, /do not recontour, level, recentre or add gum tissue/);
  assert.match(prompt, /Keep the upper dental midline close to its original position/);
  assert.ok(prompt.indexOf("concept visualisation") < prompt.indexOf("ORTHODONTIC ALIGNMENT CONCEPT"));
});

test("straightening one arch leaves the other exactly as photographed", () => {
  assert.match(buildSmileInstruction(aligned({ arches: "Upper" })), /Keep the lower teeth exactly as photographed/);
  assert.match(buildSmileInstruction(aligned({ arches: "Lower" })), /Keep the upper teeth in their photographed positions/);
});

test("alignment only keeps every tooth's own shape and shade", () => {
  const prompt = buildSmileInstruction(aligned({ arches: "Both", only: true }, { targetShade: "Bleach", designIntent: "Reshape" }));
  assert.match(prompt, /ALIGNMENT ONLY: no restorative change is planned/);
  assert.match(prompt, /Preserve the original tooth colour and shade exactly as photographed/);
  assert.match(prompt, /SHADE ONLY: Change only the colour/);
  assert.ok(!prompt.includes("noticeably brighter bleached-white"));
  assert.ok(!prompt.includes("Tooth morphology preference:"));
});

test("alignment is a change on its own, so it can be generated with the shade kept", () => {
  const keep = { ...defaultSettings, designIntent: "Shade only" as const, targetShade: "The same" as const };
  assert.equal(isNoChangeDesign(keep), true);
  assert.equal(isNoChangeDesign({ ...keep, alignment: { arches: "Lower" } }), false);
});

test("unknown arches are rejected", () => {
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, alignment: { arches: "Sideways" } }).success, false);
});

test("the report and treatment notes record the alignment and ask for orthodontic assessment", () => {
  assert.deepEqual(preferenceRows(aligned({ arches: "Both", only: true })).find(([label]) => label === "Alignment concept"),
    ["Alignment concept", "Both arches · alignment only · orthodontic suitability not assessed"]);
  const only = treatmentImplications(aligned({ arches: "Upper", only: true }));
  assert.equal(only.items[0].title, "Orthodontic alignment of the upper arch");
  assert.ok(!only.items.some(item => /bonding|veneers on/i.test(item.title)));
  const combined = treatmentImplications(aligned({ arches: "Both" }));
  assert.ok(combined.items.some(item => item.title === "Orthodontic alignment of both arches"));
  assert.ok(combined.items.some(item => /bonding|Porcelain/.test(item.title)));
});
