import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, smileArcs, biteContexts } from "../src/lib/types";
import { settingsSchema } from "../src/lib/generation/schema";
import { canGuideSmileArc, smilePrinciplesInstruction } from "../src/lib/smilePrinciples";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import { preferenceRows } from "../src/lib/report";
import { treatmentImplications } from "../src/lib/implications";
import { saveCase, readCase } from "../src/lib/storage";

test("principles support every listed choice and preserve legacy cases", () => {
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, smileArc: undefined, biteContext: undefined }).success, true);
  for (const smileArc of smileArcs) for (const biteContext of biteContexts)
    assert.equal(settingsSchema.safeParse({ ...defaultSettings, smileArc, biteContext }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, smileArc: "Automatically correct the bite" }).success, false);
});

test("arc preferences cannot introduce shape edits into colour, gap or repair-only plans", () => {
  for (const designIntent of ["Shade only", "Close gaps", "Repair edges"] as const) {
    const settings = { ...defaultSettings, designIntent, smileArc: "Follow lower lip" as const };
    assert.equal(canGuideSmileArc(settings), false);
    assert.match(smilePrinciplesInstruction(settings), /preference is inactive/);
    assert.match(Object.fromEntries(preferenceRows(settings))["Smile arc preference"], /not applied/);
  }
  assert.equal(canGuideSmileArc({ ...defaultSettings, shotType: "Close-up" }), false);
  assert.equal(canGuideSmileArc({ ...defaultSettings, toothPlans: [{ tooth: 31, condition: "Natural", intent: "Reshape" }] }), false);
  assert.equal(canGuideSmileArc({ ...defaultSettings, designIntent: "Shade only", toothPlans: [{ tooth: 11, condition: "Natural", intent: "Reshape" }] }), true);
});

test("lip guidance remains subordinate to per-tooth length permissions", () => {
  const prompt = buildSmileInstruction({ ...defaultSettings, smileArc: "Follow lower lip", biteContext: "Deep bite", designIntent: "Reshape" });
  assert.match(prompt, /flatter lip supports a flatter arc/);
  assert.match(prompt, /if matching the arc requires an unapproved edge change, preserve that edge/);
  assert.match(prompt, /Never lengthen premolars merely to fill dark space/);
  assert.match(prompt, /Keep incisal edge positions unchanged unless clinician notes explicitly request/);
  assert.match(prompt, /BITE CONTEXT \(clinician supplied\): Deep bite/);
  assert.match(prompt, /not permission for bite correction/);
});

test("bite context reaches patient reports even in shade-only mode", () => {
  const settings = { ...defaultSettings, designIntent: "Shade only" as const, biteContext: "Deep bite" as const };
  assert.match(Object.fromEntries(preferenceRows(settings))["Bite context (clinician entered)"], /Deep bite/);
  assert.ok(treatmentImplications(settings).items.some(i => i.title === "Recorded bite finding: Deep bite"));
  assert.ok(!treatmentImplications(defaultSettings).items.some(i => i.title.startsWith("Recorded bite finding:")));
});

test("principles survive restoring the case without altering the original photo", async () => {
  const photo = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", name: "test.png", width: 1, height: 1 };
  const settings = { ...defaultSettings, smileArc: "Flatter" as const, biteContext: "Deep bite" as const };
  await saveCase({ photo, settings, result: null, screen: "design" });
  const stored = await readCase();
  assert.equal(stored?.settings.smileArc, "Flatter");
  assert.equal(stored?.settings.biteContext, "Deep bite");
  assert.equal(stored?.photo?.dataUrl, photo.dataUrl);
  await saveCase(null);
});
