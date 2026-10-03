import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, type SmileSettings } from "../src/lib/types";
import { isNoChangeDesign } from "../src/lib/generation/designPlan";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema, generationSchema } from "../src/lib/generation/schema";
import { treatmentImplications } from "../src/lib/implications";
import { preferenceRows } from "../src/lib/report";

const aligned = (alignment: SmileSettings["alignment"], extra: Partial<SmileSettings> = {}): SmileSettings => ({ ...defaultSettings, alignment, ...extra });

test("alignment off leaves the protected-position instructions exactly as before", () => {
  const prompt = buildSmileInstruction(defaultSettings);
  assert.ok(!prompt.includes("ORTHODONTIC ALIGNMENT"));
  assert.match(prompt, /Preserve tooth positions, axes, rotations and arch form\./);
  assert.match(prompt, /Intensity:.*never a new type of edit/);
  assert.match(prompt, /Do not edit the gingiva/);
});

test("straightening both arches permits whole-tooth movement, including the lower teeth, and nothing more", () => {
  const settings = aligned({ arches: "Both" });
  assert.equal(settingsSchema.safeParse(settings).success, true);
  const prompt = buildSmileInstruction(settings);
  assert.match(prompt, /ORTHODONTIC ALIGNMENT CONCEPT \(upper and lower arches/);
  assert.match(prompt, /Both visible arches may be repositioned within the photographed bite relationship/);
  assert.match(prompt, /Each tooth keeps its crown shape, size, incisal edge, wear, texture and shade/);
  assert.match(prompt, /close a missing-tooth space by drifting neighbours/);
  assert.match(prompt, /original smile envelope/);
  assert.match(prompt, /separate alignment permission governs whole-tooth positioning/);
  assert.match(prompt, /Reposition whole visible teeth within the selected scope/);
  // Gums still never edited, midline still kept, the concept framing still first.
  assert.match(prompt, /Do not edit the gingiva/);
  assert.match(prompt, /Retain natural gingival margins/);
  assert.match(prompt, /Do not recentre, level or symmetrise the gums/);
  assert.match(prompt, /Keep the upper dental midline close to its original position/);
  assert.ok(prompt.indexOf("PRESERVATION") < prompt.indexOf("ORTHODONTIC ALIGNMENT CONCEPT"));
});

test("legacy alignment requests now generate both arches without rewriting saved choices", () => {
  for (const arches of ["Upper", "Lower", "Both"] as const) {
    const saved = aligned({ arches, only: true });
    const parsed = generationSchema.parse({ originalImage: "data:image/jpeg;base64,/9j/", settings: saved }).settings;
    assert.equal(parsed.alignment?.arches, "Both");
    assert.match(buildSmileInstruction(saved), /ORTHODONTIC ALIGNMENT CONCEPT \(upper and lower arches/);
    assert.doesNotMatch(buildSmileInstruction(saved), /Keep the lower teeth exactly|Keep the upper teeth in their photographed positions/);
    assert.equal(saved.alignment?.arches, arches, "existing case history stays intact");
  }
});

test("alignment only keeps every tooth's own shape and shade", () => {
  const prompt = buildSmileInstruction(aligned({ arches: "Both", only: true }, { targetShade: "Bleach", designIntent: "Reshape" }));
  assert.match(prompt, /ALIGNMENT ONLY: no restorative change is planned/);
  assert.match(prompt, /No intentional shade change from the source appearance/);
  assert.doesNotMatch(prompt, /SHADE ONLY:|TREATMENT:.*[Cc]omposite|Material:/, "alignment-only must not inherit restorative/fixed-position rules");
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

test("new Alignment selection is positions-only and retains saved restorative choices", async () => {
  const module = await import("../src/lib/fullArch");
  const choose = (module as unknown as { chooseAlignment: (s: typeof defaultSettings) => typeof defaultSettings }).chooseAlignment;
  assert.equal(typeof choose, "function");
  const s = { ...defaultSettings, treatment: "Porcelain" as const, targetShade: "BL1" as const };
  const result = choose(s);
  assert.deepEqual(result.alignment, { arches: "Both", only: true });
  assert.equal(choose({ ...s, alignment: { arches: "Lower" } }).alignment?.arches, "Both");
  assert.equal(result.treatment, s.treatment); assert.equal(result.targetShade, s.targetShade);
  assert.equal(result.treatmentMode, "standard");
  assert.match(buildSmileInstruction(result), /ALIGNMENT ONLY/);
});
