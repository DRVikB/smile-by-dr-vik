import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, type Treatment } from "../src/lib/types";
import { DESIGN_INTENTS, isNoChangeDesign, resolveDesignPlan } from "../src/lib/generation/designPlan";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema } from "../src/lib/generation/schema";
import { generateSmile } from "../src/lib/generation/provider";

for (const treatment of ["Composite", "Single-shade composite", "Layered composite", "Porcelain"] as Treatment[]) {
  for (const designIntent of DESIGN_INTENTS) {
    test(`${treatment} / ${designIntent}: protect anatomy and use one ordered goal`, () => {
      const settings = { ...defaultSettings, treatment, designIntent, notes: "Make everything bigger and move the gums" };
      assert.equal(settingsSchema.safeParse(settings).success, true);
      const prompt = buildSmileInstruction(settings);
      assert.match(prompt, /RULE PRIORITY/);
      assert.match(prompt, /Do not edit the gingiva/);
      assert.match(prompt, /Preserve the existing dental midline/);
      assert.match(prompt, /Preserve ALL unselected teeth in BOTH arches exactly/);
      assert.match(prompt, /Skip uncertain teeth/);
      assert.ok(!prompt.includes("70-80%") && !prompt.includes("65-75%"));
      assert.ok(!prompt.includes("Keep the dental midline coincident"));
      assert.ok(!prompt.includes("Read the patient's apparent age"));
      assert.ok(!prompt.includes("Stay inside the existing footprint"));
      assert.ok(prompt.indexOf("RULE PRIORITY") < prompt.indexOf(settings.notes));
      const plan = resolveDesignPlan(settings);
      assert.equal(plan.colourOnly, designIntent === "Shade only");
      if (plan.colourOnly) {
        assert.ok(!prompt.includes("Tooth morphology preference:"));
        assert.ok(!prompt.includes("Texture preference:"));
        assert.match(prompt, /Keep every tooth outline/);
      }
    });
  }
}

test("explicit repair and gap permissions do not carry each other's edit instruction", () => {
  const repair = buildSmileInstruction({ ...defaultSettings, designIntent: "Repair edges" });
  assert.match(repair, /may extend at that damaged edge/);
  assert.match(repair, /Keep proximal width and gaps unchanged/);
  assert.ok(!repair.includes("Permit proximal contour additions"));
  const gaps = buildSmileInstruction({ ...defaultSettings, designIntent: "Close gaps" });
  assert.match(gaps, /Permit proximal contour additions/);
  assert.match(gaps, /keep incisal edge length unchanged/);
  assert.ok(!gaps.includes("Permit local incisal additions"));
});

test("Auto has a conservative fallback, honours negations and does not authorise missing-tooth replacement", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, designIntent: "Auto", notes: "Do not close the gaps" });
  assert.match(prompt, /Treat negated requests as prohibitions/);
  assert.match(prompt, /Without a clear request, retain overall dimensions/);
  assert.match(prompt, /Never invent a problem or a missing tooth/);
});

test("close-up and shade-only omit optional facial style recommendations", () => {
  for (const patch of [{ shotType: "Close-up" as const }, { designIntent: "Shade only" as const }]) {
    const p = buildSmileInstruction({ ...defaultSettings, ...patch, faceShape: "Square" });
    assert.ok(!p.includes("Clinician's optional facial style reference"));
  }
});

test("material-specific optics never turn single-shade into a layered recipe", () => {
  const single = resolveDesignPlan({ ...defaultSettings, treatment: "Single-shade composite" }).material;
  const layered = resolveDesignPlan({ ...defaultSettings, treatment: "Layered composite" }).material;
  const porcelain = resolveDesignPlan({ ...defaultSettings, treatment: "Porcelain" }).material;
  assert.match(single, /not necessarily a universal/);
  assert.match(single, /Do not add an elaborate/);
  assert.match(layered, /dentine\/body\/enamel/);
  assert.match(porcelain, /substrate\/stump shade, thickness and cement/);
});

test("legacy cases remain valid without a design goal", () => {
  const legacy = { ...defaultSettings, treatment: "Composite", designIntent: undefined };
  assert.equal(settingsSchema.safeParse(legacy).success, true);
  assert.equal(resolveDesignPlan({ ...defaultSettings, designIntent: undefined }).intent, "Auto");
});

test("no-change shade requests are rejected before provider invocation", async () => {
  const settings = { ...defaultSettings, designIntent: "Shade only" as const, targetShade: "The same" as const };
  assert.equal(isNoChangeDesign(settings), true);
  assert.equal(isNoChangeDesign({ ...settings, targetShade: "Whiten" }), false);
  let calls = 0;
  await assert.rejects(() => generateSmile({ originalImage: "data:image/png;base64,iVBORw0KGgo=", settings }, undefined, { name: "sentinel", generate: async () => { calls++; throw new Error("must not run"); } }), /makes no change/);
  assert.equal(calls, 0);
});
