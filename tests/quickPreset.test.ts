import test from "node:test";
import assert from "node:assert/strict";
import { mostUsedPreset, presetFromSettings, presetIsEmpty, presetSettings, presetSummary, type QuickPreset } from "../src/lib/quickPreset";
import { defaultSettings, upperTeeth } from "../src/lib/types";
import { selectedTreatments } from "../src/lib/fullArch";

const example: QuickPreset = { arches: "both", straighten: true, whitening: "Bleach", restoration: "Layered composite", teeth: 8 };

test("the owner's example: both arches, straightened, bleach, layered bonding on 8 teeth", () => {
  const s = presetSettings(example, { ...defaultSettings, shape: "Square" });
  assert.equal(s.treatment, "Layered composite");
  assert.equal(s.whitening, true);
  assert.equal(s.targetShade, "Bleach");
  assert.deepEqual(s.alignment, { arches: "Both" });
  assert.equal(s.lowerTeeth, true);
  assert.equal(s.teeth, 8);
  assert.deepEqual(s.selectedTeeth, upperTeeth[8]);
  assert.equal(s.shape, "Square", "other preferences are kept");
  assert.deepEqual(selectedTreatments(s), ["Whitening", "Veneers", "Alignment"]);
  assert.equal(presetSummary(example), "Upper and lower · Straighten · Bleach white · Layered bonding · 8 teeth");
});

test("presets round-trip through design settings", () => {
  const presets: QuickPreset[] = [
    example,
    { arches: "upper", straighten: false, whitening: "Whiten", restoration: "none", teeth: 8 },
    { arches: "upper", straighten: true, whitening: "none", restoration: "none", teeth: 8 },
    { arches: "upper", straighten: false, whitening: "none", restoration: "Porcelain", teeth: 10 },
  ];
  for (const p of presets) {
    const back = presetFromSettings(presetSettings(p, defaultSettings));
    assert.ok(back);
    assert.equal(back.straighten, p.straighten);
    assert.equal(back.whitening, p.whitening);
    assert.equal(back.restoration, p.restoration);
    if (p.restoration !== "none") assert.equal(back.teeth, p.teeth);
  }
});

test("straightening alone stays a position-only concept", () => {
  const s = presetSettings({ arches: "upper", straighten: true, whitening: "none", restoration: "none", teeth: 8 }, defaultSettings);
  assert.deepEqual(s.alignment, { arches: "Both", only: true });
});

test("a preset needs at least one treatment, and full arch or one-tooth designs aren't counted", () => {
  assert.ok(presetIsEmpty({ arches: "upper", straighten: false, whitening: "none", restoration: "none", teeth: 8 }));
  assert.equal(presetFromSettings({ ...defaultSettings, treatmentMode: "full_arch" }), null);
});

test("most used appears after five designs and picks the most common", () => {
  const key = (p: QuickPreset) => JSON.stringify([p.arches, p.straighten, p.whitening, p.restoration, p.teeth]);
  const whiten: QuickPreset = { arches: "upper", straighten: false, whitening: "Whiten", restoration: "none", teeth: 8 };
  assert.equal(mostUsedPreset({ [key(example)]: 2, [key(whiten)]: 2 }), null);
  const found = mostUsedPreset({ [key(example)]: 4, [key(whiten)]: 2, "not json": 9 });
  assert.ok(found);
  assert.deepEqual(found.preset, example);
  assert.equal(found.designs, 15);
});

test("the tile's short line", async () => {
  const { presetShortSummary } = await import("../src/lib/quickPreset");
  assert.equal(presetShortSummary(example), "Both arches · Straighten · Bleach · 8 layered bonding");
  assert.equal(presetShortSummary({ arches: "upper", straighten: false, whitening: "Whiten", restoration: "none", teeth: 8 }), "Whiten");
});
