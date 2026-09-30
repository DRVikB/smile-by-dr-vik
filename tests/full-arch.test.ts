import test from "node:test";
import assert from "node:assert/strict";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { settingsSchema } from "../src/lib/generation/schema";
import { isNoChangeDesign } from "../src/lib/generation/designPlan";
import { chooseFullArch, chooseStandard } from "../src/lib/fullArch";
import { toothSummary } from "../src/lib/teeth";
import { designSummary, proposedSmileRows, treatmentOverview } from "../src/lib/consultation";
import { preferenceRows } from "../src/lib/report";
import { protectionPlan } from "../src/lib/toothMap/protect";
import { archRegion, occlusalSplit } from "../src/lib/toothMap/arch";
import { photoFingerprint, type ToothMap } from "../src/lib/toothMap/types";
import { defaultSettings, FULL_ARCH_DISCLAIMER, type SmileSettings } from "../src/lib/types";

const base = (patch: Partial<SmileSettings> = {}): SmileSettings => ({ ...defaultSettings, ...patch });
const fullArch = (arch: "upper" | "lower" | "both", restorationType: "zirconia" | "provisional" = "zirconia", extra: Partial<SmileSettings> = {}) =>
  chooseFullArch(base(extra), { arch, restorationType });

test("existing composite, porcelain and alignment cases are unchanged", () => {
  for (const s of [base({ treatment: "Single-shade composite" }), base({ treatment: "Porcelain" }), base({ alignment: { arches: "Both" } })]) {
    assert.equal(s.treatmentMode, undefined);
    const prompt = buildSmileInstruction(s);
    assert.match(prompt, /Modify only visible existing selected teeth/);
    assert.doesNotMatch(prompt, /full-arch/i);
  }
  // A saved case from before this feature still validates, with no full-arch fields.
  const old = settingsSchema.parse(base({ treatment: "Porcelain" }));
  assert.equal(old.treatmentMode, undefined);
  assert.equal(old.fullArch, undefined);
});

test("full-arch is exclusive: straightening off, material and tooth plan set aside, arch defaults sensibly", () => {
  const aligned = base({ alignment: { arches: "Lower" }, treatment: "Porcelain" });
  const fa = chooseFullArch(aligned);
  assert.equal(fa.treatmentMode, "full_arch");
  assert.equal(fa.alignment, undefined, "Straighten + Full-arch is never a state");
  assert.equal(fa.fullArch!.arch, "lower", "the arch the case already named");
  assert.equal(fa.fullArch!.restorationType, "zirconia");
  assert.equal(fa.fullArch!.prostheticGingiva, "auto");
  assert.equal(chooseFullArch(base()).fullArch!.arch, "upper", "Upper by default");
  // Back to composite: standard mode; the full-arch choices are remembered for next time.
  const back = chooseStandard(fa, { treatment: "Single-shade composite" });
  assert.equal(back.treatmentMode, "standard");
  assert.equal(back.treatment, "Single-shade composite");
  assert.match(buildSmileInstruction(back), /Modify only visible existing selected teeth/);
  assert.equal(chooseFullArch(back).fullArch!.arch, "lower", "the arch persists");
});

test("full-arch generation is built from the structured plan, with the face and smile envelope protected", () => {
  const both = fullArch("both", "zirconia", { shape: "Square", targetShade: "B1" });
  const prompt = buildSmileInstruction(both);
  assert.match(prompt, /upper and lower full-arch fixed zirconia restorative concept/);
  assert.match(prompt, /square forms/);
  assert.match(prompt, /B1 shade/);
  assert.match(prompt, /CHANGE THE TEETH, NOT THE PERSON/);
  assert.match(prompt, /Do not widen the mouth\. Do not open the lips further\./);
  assert.match(prompt, /beard and facial hair/);
  assert.match(prompt, /visual restorative concept only/);
  assert.doesNotMatch(prompt, /Modify only visible existing selected teeth/, "no 4/6/8/10 selected-tooth instructions");
  assert.doesNotMatch(prompt, /FDI/);

  const upper = buildSmileInstruction(fullArch("upper"));
  assert.match(upper, /upper full-arch/);
  assert.match(upper, /PROTECTED: the lower arch/);
  assert.match(buildSmileInstruction(fullArch("lower")), /PROTECTED: the upper arch/);
  assert.match(buildSmileInstruction(fullArch("upper", "provisional")), /provisional \(PMMA\)/);
  assert.match(buildSmileInstruction(chooseFullArch(base(), { prostheticGingiva: "include" })), /include a natural pink prosthetic gingival flange/);
  assert.match(buildSmileInstruction(chooseFullArch(base(), { prostheticGingiva: "exclude" })), /Prosthetic gingiva: none/);
});

test("the request carries full-arch settings and rejects anything else", () => {
  const ok = settingsSchema.safeParse(fullArch("both", "provisional"));
  assert.ok(ok.success);
  assert.deepEqual(ok.data!.fullArch, { arch: "both", restorationType: "provisional", prostheticGingiva: "auto" });
  assert.equal(settingsSchema.safeParse({ ...fullArch("both"), fullArch: { arch: "middle", restorationType: "zirconia", prostheticGingiva: "auto" } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...fullArch("both"), treatmentMode: "all_on_x" }).success, false);
});

test("a full-arch case is always a change, summarises by arch and reads correctly in reports", () => {
  const fa = fullArch("both", "zirconia", { targetShade: "The same", designIntent: "Shade only" });
  assert.equal(isNoChangeDesign(fa), false);
  assert.equal(toothSummary(fa), "Upper + lower full arch");
  assert.equal(toothSummary(fullArch("upper")), "Upper full arch");
  assert.match(designSummary(fa).headline, /Full-arch restoration · Upper \+ Lower/);
  assert.match(designSummary(fa).detail, /Zirconia/);
  const rows = proposedSmileRows(fa);
  assert.deepEqual(rows.slice(0, 3), [["Treatment", "Full-arch restoration"], ["Arch", "Upper + Lower"], ["Restoration concept", "Zirconia"]]);
  assert.ok(preferenceRows(fa).some(([k, v]) => k === "Restoration concept" && v === "Zirconia"));
  assert.ok(treatmentOverview(fa)[0].text.includes(FULL_ARCH_DISCLAIMER));
});

// A mouth opening 100–300 × 40–120 with upper teeth whose edges sit at y = 80.
const W = 400, H = 160;
function archMap(): ToothMap {
  const teeth = [120, 160, 200, 240].map((x, i) => ({
    id: `t${i}`, fdi: [12, 11, 21, 22][i], detectedIndex: i, confidence: 0.9,
    bbox: { x: x / W, y: 45 / H, width: 30 / W, height: 35 / H }, centroid: { x: (x + 15) / W, y: 62 / H },
    outline: [[x, 45], [x + 30, 45], [x + 30, 80], [x, 80]].map(([a, b]) => [a / W, b / H] as [number, number]),
    exactMaskRef: `outline:t${i}`, visible: true, selected: false, requiresReview: false, source: "detected" as const,
  }));
  return { photoId: photoFingerprint("data:image/jpeg;base64,photo"), arch: "upper", teeth, confirmedByClinician: false, version: 1, method: "on-device-v1",
    mouthOpening: [[100, 40], [300, 40], [300, 120], [100, 120]].map(([x, y]) => [x / W, y / H] as [number, number]) };
}

test("full-arch protection is by arch: one arch editable, the opposite arch, lips and face protected", () => {
  const map = archMap();
  const split = occlusalSplit(map, W, H)!;
  assert.ok(Math.abs(split(200) - 80) < 1, "the split follows the upper incisal edges");
  const upper = archRegion(map, W, H, "upper")!, lower = archRegion(map, W, H, "lower")!;
  const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];
  assert.equal(at(upper, 200, 60), 1, "upper teeth editable");
  assert.equal(at(upper, 200, 110), 0, "lower arch protected");
  assert.equal(at(upper, 50, 60), 0, "outside the lips protected");
  assert.equal(at(lower, 200, 110), 1);
  assert.equal(at(lower, 200, 55), 0, "upper arch protected");
  // Tooth-by-tooth protection steps aside for full-arch; the request is never blocked for "no teeth".
  const plan = protectionPlan(map, "data:image/jpeg;base64,photo", fullArch("upper"));
  assert.deepEqual(plan, { ok: false, reason: "full-arch" });
  // Works with no teeth found at all (heavily broken-down or edentulous): the split falls back to the mouth's middle.
  const empty = { ...map, teeth: [] };
  assert.ok(Math.abs(occlusalSplit(empty, W, H)!(200) - 80) < 1);
});
