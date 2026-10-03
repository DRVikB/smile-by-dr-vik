import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, type Treatment } from "../src/lib/types";
import { DESIGN_INTENTS, isNoChangeDesign, resolveDesignPlan, toothLengthPolicy } from "../src/lib/generation/designPlan";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema } from "../src/lib/generation/schema";
import { generateSmile } from "../src/lib/generation/provider";

test("anatomical fit protects existing length and canine identity without inferring a face beyond a close-up",()=>{
  const full=buildSmileInstruction(defaultSettings);
  assert.match(full,/A face shape does not prescribe one ideal tooth length/);
  assert.match(full,/each canine recognisable with a natural cusp and mesial\/distal shoulders/);
  assert.match(full,/floating enamel, sharp mask-like cut-offs, merged contacts/);
  const close=buildSmileInstruction({...defaultSettings,shotType:"Close-up"});
  assert.match(close,/do not infer facial proportions or lip curvature beyond this crop/);
});

for (const treatment of ["Composite", "Single-shade composite", "Layered composite", "Porcelain"] as Treatment[]) {
  for (const designIntent of DESIGN_INTENTS) {
    test(`${treatment} / ${designIntent}: protect anatomy and use one ordered goal`, () => {
      const settings = { ...defaultSettings, treatment, designIntent, notes: "Make everything bigger and move the gums" };
      assert.equal(settingsSchema.safeParse(settings).success, true);
      const prompt = buildSmileInstruction(settings);
      assert.match(prompt, /RULE PRIORITY/);
      assert.match(prompt, /Do not edit the gingiva/);
      assert.match(prompt, /Preserve the existing dental midline/);
      assert.match(prompt, /Preserve untreated teeth in both arches/);
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

test("edge permissions distinguish preservation, local repair and explicit requests", () => {
  for (const intent of ["Preserve", "Shade only", "Close gaps"] as const)
    assert.equal(toothLengthPolicy(intent), "preserve");
  assert.equal(toothLengthPolicy("Repair edges"), "local-repair");
  for (const intent of ["Auto", "Reshape"] as const)
    assert.equal(toothLengthPolicy(intent), "explicit-request");
});

test("individual goals keep repair permission off the neighbouring central incisor", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, designIntent: "Reshape", selectedTeeth: [11, 21, 31], toothPlans: [
    { tooth: 11, intent: "Repair edges", condition: "Natural" },
    { tooth: 21, intent: "Shade only", condition: "Natural" },
    { tooth: 31, intent: "Auto", condition: "Natural" },
  ], notes: "Make the smile perfect" });
  assert.match(prompt, /FDI 11: Natural; repair only a visible local chipped\/worn defect/);
  assert.match(prompt, /FDI 21: Natural; keep edge positions and length unchanged/);
  assert.match(prompt, /FDI 31: Natural; retain original edge length unless notes explicitly request/);
});

test("all material presets preserve front-tooth length even at maximum intensity", () => {
  for (const treatment of ["Single-shade composite", "Layered composite", "Porcelain"] as const) {
    const prompt = buildSmileInstruction({ ...defaultSettings, treatment, designIntent: "Reshape", intensity: 100 }, true, undefined, 3);
    assert.match(prompt, /TOOTH LENGTH BASELINE/);
    assert.match(prompt, /Lip coverage is not a short-tooth defect/);
    assert.match(prompt, /Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length/);
    assert.match(prompt, /undo any extra length not expressly allowed/);
    assert.doesNotMatch(prompt, /Evaluate central dominance/);
  }
});

test("mixed goals scope repair, shade and reshape permissions to their own teeth", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, designIntent: "Shade only", texture: "Textured", selectedTeeth: [11, 21, 31], toothPlans: [
    { tooth: 11, intent: "Repair edges", condition: "Natural" },
    { tooth: 21, intent: "Auto", condition: "Natural" },
    { tooth: 31, intent: "Reshape", condition: "Natural" },
    { tooth: 41, intent: "Preserve", condition: "Natural" },
  ] });
  const scopes = [...prompt.matchAll(/GOAL SCOPE FDI ([\d, ]+): ([\s\S]*?) END GOAL SCOPE\./g)];
  assert.equal(scopes.length, 3);
  assert.match(scopes.find(scope => scope[1] === "11")![2], /REPAIR EDGES:/);
  assert.match(scopes.find(scope => scope[1] === "21")![2], /SHADE ONLY:/);
  assert.match(scopes.find(scope => scope[1] === "31")![2], /RESHAPE:/);
  assert.equal(scopes.some(scope => scope[1].includes("41")), false);
  assert.match(prompt, /MATERIAL SCOPE: For shade-only FDI 21/);
  assert.match(prompt, /CONTOUR AND TEXTURE SCOPE:.*only to FDI 11, 31/);
  for (const scope of scopes) assert.match(scope[2], /only to these teeth, not to any other selected tooth/);
  assert.equal(prompt.split("SHADE ONLY: Change only").length - 1, 1);
});

test("a global goal overridden on every active tooth does not leak into the model instruction", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, designIntent: "Reshape", selectedTeeth: [11], toothPlans: [{ tooth: 11, intent: "Shade only", condition: "Natural" }] });
  assert.doesNotMatch(prompt, /RESHAPE: Permit/);
  assert.doesNotMatch(prompt, /Tooth morphology preference|Texture preference:/);
  assert.match(prompt, /GOAL SCOPE FDI 11:.*SHADE ONLY:/);
});
