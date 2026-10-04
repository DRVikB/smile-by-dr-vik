import test from "node:test";
import assert from "node:assert/strict";
import * as contract from "../src/lib/generation/contract";
import { contractExamples } from "./fixtures/generation-contract-examples";
import { generateSmile } from "../src/lib/generation/provider";
import { readFileSync } from "node:fs";

test("Sunburst instruction: plain sections, named teeth, explicit keep-list and mask meaning", () => {
  const builder = (contract as Record<string, unknown>).buildSunburstPrompt;
  assert.equal(typeof builder, "function");
  const build = builder as (s: typeof contractExamples[string], context?: Parameters<typeof contract.buildSunburstPrompt>[1]) => string;
  const whitening = build(contractExamples.Whitening), veneers = build(contractExamples.Porcelain), alignment = build(contractExamples.Alignment), arch = build(contractExamples["Full Arch preserve gingiva"]);
  for (const prompt of [whitening, veneers, alignment, arch]) {
    assert.match(prompt, /^Edit image 1, a portrait photo\. Change only the teeth/);
    for (const heading of ["WHAT TO CHANGE", "KEEP EXACTLY AS PHOTOGRAPHED", "MASK", "RESULT"]) assert.equal(prompt.match(new RegExp("^" + heading + "$", "gm"))?.length, 1);
    assert.match(prompt, /do not open the mouth wider/); assert.match(prompt, /same framing and scale: never a close-up/);
    assert.match(prompt, /transparent part of the mask is where edits are allowed/);
    // Legal/report prose and on-screen guide coordinates are for people, not the image model.
    assert.doesNotMatch(prompt, /RULE PRIORITY|contract|diagnosis|on-screen guide|retractor/i);
    assert.ok(prompt.length < 3200, `${prompt.length} characters`);
  }
  assert.match(whitening, /Teeth to edit: the six upper front teeth, canine to canine: upper right canine \(13\).*upper left canine \(23\)\. The patient's right side is on the left of the image\./);
  assert.match(whitening, /teeth whitening, colour only/); assert.doesNotMatch(whitening, /Goal:|Design \(/);
  assert.match(whitening, /Every tooth not listed above, including all lower teeth: same position, shape, size, colour and visibility/);
  assert.match(veneers, /porcelain veneers/); assert.match(veneers, /Goal: modestly reshape/); assert.match(veneers, /Tooth length: keep every biting edge exactly where it is\./); assert.match(veneers, /VITA B1/);
  assert.match(alignment, /straighten the teeth \(alignment concept\) in both arches/); assert.match(alignment, /keeps its own shape, size, biting edge, wear, texture and colour/); assert.doesNotMatch(alignment, /porcelain|bleach|Teeth to edit/i);
  assert.match(arch, /full-arch zirconia restoration of the visible upper and lower teeth/); assert.match(arch, /existing natural gum line/); assert.doesNotMatch(arch, /\(14\)|\(13\)/);
  assert.match(build(contractExamples["Full Arch include prosthetic gingiva"]), /you may add natural-looking pink prosthetic gum/);
  const single = build(contractExamples["Single tooth"]);
  assert.match(single, /Teeth to edit: upper right central incisor \(11\)\./);
  assert.match(single, /^- Upper right central incisor \(11\): slightly longer, staying inside the current mouth opening; soft square shape/m);
  assert.match(single, /except where a tooth line below says otherwise/);
  const close = build({ ...contractExamples.Porcelain, shotType: "Close-up" }, { hasReference: true, styleReferenceCount: 2 });
  assert.match(close, /^Edit image 1, a close-up dental photo/); assert.match(close, /cheek retractors/); assert.match(close, /never a tighter crop/);
  assert.match(close, /Image 2 is a smile the patient likes/); assert.match(close, /Images 3 and 4 are finished cases/);
});

test("Sunburst results retain pipeline and treatment version metadata for case persistence", async () => {
  const image = "data:image/jpeg;base64," + readFileSync("public/sample-smile.jpg").toString("base64");
  const result = await generateSmile({ originalImage: image, settings: contractExamples.Porcelain }, undefined, { name: "openai", vendor: "openai", model: "gpt-image-2.5-sunburst", generate: async () => ({ image, mode: "live", variationId: crypto.randomUUID() }) });
  assert.equal(result.generation?.pipelineVersion, "SC-SUNBURST-V1");
  assert.equal(result.generation?.treatmentPromptVersion, "VENEERS-V1");
});
