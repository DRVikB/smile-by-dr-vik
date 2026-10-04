import test from "node:test";
import assert from "node:assert/strict";
import { buildImageEditPrompt } from "../src/lib/generation/imageEditPrompt";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema } from "../src/lib/generation/schema";
import { chooseFullArch } from "../src/lib/fullArch";
import { defaultSettings } from "../src/lib/types";
import { upperTeeth, type SmileSettings } from "../src/lib/types";
import { normalizeGenerationContract, renderGenerationContract } from "../src/lib/generation/contract";
import { toothEditRule } from "../src/lib/toothMap/masks";

test("alignment-only never receives restorative, fixed-position shade or reference rules", () => {
  const p = buildImageEditPrompt({ ...defaultSettings, alignment: { arches: "Both", only: true }, designIntent: "Shade only" }, true);
  assert.match(p, /ALIGNMENT ONLY/);
  assert.doesNotMatch(p, /Material:|Treatment material:|SHADE ONLY|Keep all identity, gum architecture and tooth positions/);
});
test("full arch default and legacy Auto preserve gingiva; explicit Include is the sole exception", () => {
  assert.equal(chooseFullArch(defaultSettings).fullArch?.prostheticGingiva, "exclude");
  const auto = chooseFullArch(defaultSettings, { prostheticGingiva: "auto" });
  assert.match(buildImageEditPrompt(auto), /do not add pink prosthetic material/);
  assert.equal(auto.fullArch?.prostheticGingiva, "auto", "never mutate saved legacy data");
  const include = buildImageEditPrompt(chooseFullArch(defaultSettings, { prostheticGingiva: "include" }));
  assert.match(include, /selected prosthetic interface/);
  assert.doesNotMatch(include, /preserve all visible natural gingiva|never over existing natural gum tissue/);
});
test("Keep never permits an alternative shade in full arch", () => {
  const p = buildImageEditPrompt(chooseFullArch({ ...defaultSettings, targetShade: "The same" }));
  assert.match(p, /No intentional shade change/);
  assert.doesNotMatch(p, /existing shade is not a constraint|shade harmonised with/);
});
test("explicit Whitening validates and is automatically colour-only; restorative Whiten remains restorative", () => {
  const s = settingsSchema.parse({ ...defaultSettings, treatment: "Whitening", designIntent: "Reshape" });
  const p = buildImageEditPrompt(s);
  assert.match(p, /WHITENING:.*colour.*only/);
  assert.doesNotMatch(p, /RESHAPE:|Material:/);
  assert.match(buildImageEditPrompt({ ...defaultSettings, treatment: "Porcelain", targetShade: "Whiten", designIntent: "Reshape" }), /RESHAPE:/);
});
test("current shade has explicit provenance; absent/legacy defaults are not clinical facts", () => {
  const s = settingsSchema.parse({ ...defaultSettings, currentShade: "A3", currentShadeSource: "clinician" });
  assert.match(buildImageEditPrompt(s), /Clinician-confirmed current shade: A3/);
  const estimated = settingsSchema.parse({ ...s, currentShadeSource: "estimated" });
  assert.match(buildImageEditPrompt(estimated), /Estimated visual current shade: A3/);
  assert.doesNotMatch(buildImageEditPrompt({ ...defaultSettings, currentShade: "A2" }), /current shade: A2/i);
});
test("all provider adapters use the same canonical contract", () => {
  assert.equal(buildImageEditPrompt(defaultSettings, true), buildSmileInstruction(defaultSettings, true));
});
test("full arch uses arc, explicit visible style and constraints, not measured bite or patient priorities", () => {
  const s = chooseFullArch({ ...defaultSettings, smileArc: "Flatter", faceShape: "Square", clinicalData: { overbiteMm: 8, constraints: "No posterior additions", patientPriorities: "PRIVATE_PRIORITY" }, biteContext: "Deep bite" });
  const p = buildImageEditPrompt(s);
  assert.match(p, /Smile arc preference: Flatter/);
  assert.match(p, /facial style reference: Square/);
  assert.match(p, /No posterior additions/);
  assert.doesNotMatch(p, /8 mm|Deep bite|PRIVATE_PRIORITY/);
});

test("4/6/8/10 and Custom state use actual FDI membership, with preserved teeth excluded", () => {
  for (const teeth of [4, 6, 8, 10] as const) {
    const s = settingsSchema.parse({ ...defaultSettings, teeth, selectedTeeth: upperTeeth[teeth] });
    const c = normalizeGenerationContract(s);
    assert.deepEqual(c.teeth.map(p => p.tooth), upperTeeth[teeth]);
    assert.ok(renderGenerationContract(c).includes(`selected teeth (FDI: ${upperTeeth[teeth].join(", ")})`));
  }
  const c = normalizeGenerationContract(settingsSchema.parse({ ...defaultSettings, selectedTeeth: [11, 31], toothPlans: [{ tooth: 11, intent: "Reshape", condition: "Natural" }, { tooth: 31, intent: "Shade only", condition: "Natural" }, { tooth: 21, intent: "Preserve", condition: "Restored" }] }));
  assert.deepEqual(c.teeth.map(p => p.tooth), [11, 31]);
  assert.match(renderGenerationContract(c), /selected teeth \(FDI: 11, 31\)/);
  assert.match(renderGenerationContract(c), /FDI 21: Restored, preserve unchanged/);
});

test("generation-affecting design controls map to normalized values and outgoing instructions", () => {
  const cases: [Partial<SmileSettings>, string, unknown, RegExp][] = [
    [{ treatment: "Porcelain" }, "treatment", "Porcelain", /TREATMENT: Porcelain/],
    [{ shape: "Triangular" }, "shape", "Triangular", /shape Triangular/],
    [{ texture: "Textured" }, "texture", "Textured", /surface Textured/],
    [{ character: "Defined" }, "character", "Defined", /character Defined/],
    [{ intensity: 76 }, "intensity", 76, /Intensity: 76\/100/],
    [{ smileArc: "More curved" }, "smileArc", "More curved", /Smile arc preference: More curved/],
    [{ faceShape: "Tapering" }, "faceShape", "Tapering", /facial style reference: Tapering/],
    [{ shotType: "Close-up" }, "shotType", "Close-up", /Close-up\/retracted view/],
    [{ notes: "Retain the central gap" }, "notes", "Retain the central gap", /Clinician design notes: "Retain the central gap"/],
    [{ clinicalData: { constraints: "No posterior additions" } }, "constraints", "No posterior additions", /visual restrictions: "No posterior additions"/],
    [{ clinicalData: { restorativeSpace: "Limited / uncertain" } }, "limitedSpace", true, /SPACE RESTRICTION/],
  ];
  for (const [patch, key, expected, text] of cases) {
    const s = settingsSchema.parse({ ...defaultSettings, designIntent: "Reshape", ...patch });
    const c = normalizeGenerationContract(s);
    assert.equal(c[key as keyof typeof c], expected, key);
    assert.match(renderGenerationContract(c), text);
  }
  for (const targetShade of ["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"] as const) {
    const c = normalizeGenerationContract({ ...defaultSettings, targetShade });
    assert.equal(c.targetShade, targetShade);
    assert.ok(c.teeth.every(p => p.targetShade === targetShade));
    assert.match(renderGenerationContract(c), targetShade === "The same" ? /No intentional shade change/ : targetShade === "Whiten" ? /Gently whiten/ : targetShade === "Bleach" ? /brighter bleached-white/ : new RegExp(`${targetShade} shade`));
  }
});

test("single-tooth shape, width, length, edge and shade overrides stay on their own tooth", () => {
  const c = normalizeGenerationContract({ ...defaultSettings, selectedTeeth: [11], toothPlans: [{ tooth: 11, intent: "Reshape", condition: "Natural", length: -1, width: 1, edge: "Level", shape: "Soft square", targetShade: "BL2" }] });
  assert.equal(c.teeth.length, 1);
  const p = renderGenerationContract(c);
  assert.match(p, /FDI 11: Natural; clinician requests slightly shorter; shade BL2.*soft square.*slightly wider.*level, even incisal edge/);
  assert.match(p, /Neighbouring teeth are contextual references, not intentional edit targets/);
  assert.match(p, /Shade FDI 11:.*BL2 shade/);
});

test("inactive controls are explicitly excluded for whitening, alignment and close-up views", () => {
  for (const patch of [{ treatment: "Whitening" as const }, { alignment: { arches: "Both" as const, only: true } }]) {
    const c = normalizeGenerationContract({ ...defaultSettings, ...patch, designIntent: "Reshape", faceShape: "Square", shape: "Triangular", texture: "Textured", smileArc: "More curved" });
    assert.equal(c.shape, undefined); assert.equal(c.texture, undefined); assert.equal(c.faceShape, undefined);
    assert.equal(c.smileArc, "Preserve existing");
    assert.doesNotMatch(renderGenerationContract(c), /shape Triangular|surface Textured|facial style reference: Square|Smile arc preference: More curved/);
  }
  const close = normalizeGenerationContract(chooseFullArch({ ...defaultSettings, shotType: "Close-up", faceShape: "Square", smileArc: "More curved" }));
  assert.equal(close.faceShape, undefined); assert.equal(close.smileArc, "Preserve existing");
  assert.equal(toothEditRule({ ...defaultSettings, treatment: "Whitening", designIntent: "Reshape" }, undefined).exactOnly, true);
});

test("reference and mask/context instructions are subordinate and appended once", () => {
  const c = normalizeGenerationContract({ ...defaultSettings, alignment: { arches: "Both", only: true } }, { hasReference: true, styleReferenceCount: 2, hasEditMask: true, sourceBounds: { x: 0.1, y: 0, width: 0.8, height: 1 }, framing: { x: 0.2, y: 0.3, width: 0.4, height: 0.1 } });
  const p = renderGenerationContract(c);
  assert.match(p, /following 2 images are finished cases/);
  assert.match(p, /cannot override.*alignment permissions/);
  assert.match(p, /SOURCE CANVAS:.*x=0.1/);
  assert.match(p, /on-screen guide lies at 20% to 60% across/);
  assert.equal(p.split("EDIT MASK:").length - 1, 1);
  assert.doesNotMatch(p, /SHADE ONLY|Material:|Keep all identity, gum architecture and tooth positions/);
});

test("Full Arch design targets the reconstructed arch instead of nonexistent per-tooth goals", () => {
  const p = buildImageEditPrompt(chooseFullArch(defaultSettings));
  assert.match(p, /DESIGN SCOPE: the selected visible prosthetic arch/);
  assert.doesNotMatch(p, /Apply only to teeth whose goals permit contour changes/);
  assert.doesNotMatch(p, /Retain photographed central-to-lateral proportions/);
});

test("combined Whitening validates and reaches both prompts without overriding veneer shape or selected boundaries", () => {
  const settings = settingsSchema.parse({ ...defaultSettings, treatment: "Porcelain", whitening: true, alignment: { arches: "Both" }, targetShade: "B1", designIntent: "Reshape" });
  assert.equal(settings.whitening, true, "backend must not strip the checked Whitening treatment");
  const contract = normalizeGenerationContract(settings);
  assert.equal(contract.mode, "restorative");
  assert.equal(contract.whitening, true);
  assert.equal(contract.treatment, "Porcelain");
  assert.equal(contract.shape, defaultSettings.shape);
  const prompt = renderGenerationContract(contract, "canonical");
  assert.equal((prompt.match(/COMBINED WHITENING:/g) ?? []).length, 1);
  assert.match(prompt, /TREATMENT: Porcelain/);
  assert.match(prompt, /ORTHODONTIC ALIGNMENT CONCEPT/);
  assert.match(prompt, /Preserve untreated teeth/);
  assert.match(prompt, /B1 shade/);
  assert.doesNotMatch(prompt, /WHITENING: dental colour\/shade change only/);
  const sunburst = renderGenerationContract(contract, "sunburst");
  assert.equal((sunburst.match(/Whitening is included/g) ?? []).length, 1);
  assert.match(sunburst, /Treatment: porcelain veneers/);
  assert.match(sunburst, /Also straighten the teeth/);
  assert.match(sunburst, /they may only be moved as part of the straightening/);
  assert.match(sunburst, /VITA B1/);
  assert.doesNotMatch(sunburst, /teeth whitening, colour only/);
});
test("combined Whitening honours Keep and never leaks into exclusive All-on-X or alignment only", () => {
  const combined = { ...defaultSettings, whitening: true, targetShade: "The same" as const };
  assert.match(buildImageEditPrompt(combined), /COMBINED WHITENING:/);
  assert.match(buildImageEditPrompt(combined), /No intentional shade change/);
  for (const settings of [chooseFullArch(combined), { ...combined, alignment: { arches: "Both" as const, only: true } }]) {
    assert.equal(normalizeGenerationContract(settings).whitening, undefined);
    assert.doesNotMatch(buildImageEditPrompt(settings), /COMBINED WHITENING:/);
  }
});

test("the photo-edit task and whole-photo output come first; retractors are only mentioned for close-ups", () => {
  const face = buildImageEditPrompt(defaultSettings);
  assert.match(face.split("\n\n")[0], /^TASK: Edit the first image, a full-face photograph.*entire face, head, hair, clothing and background.*Do not crop to or enlarge the mouth or teeth\.$/);
  assert.doesNotMatch(face, /retractor/i);
  assert.match(face, /a text-only reply is not a result/);
  const close = buildImageEditPrompt({ ...defaultSettings, shotType: "Close-up" });
  assert.match(close.split("\n\n")[0], /^TASK: Edit the first image, a dental close-up photograph/);
  assert.match(close, /Retain retractors\./);
});
