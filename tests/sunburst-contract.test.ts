import test from "node:test";
import assert from "node:assert/strict";
import * as contract from "../src/lib/generation/contract";
import { contractExamples } from "./fixtures/generation-contract-examples";
import { generateSmile } from "../src/lib/generation/provider";
import { readFileSync } from "node:fs";

test("Sunburst treatment separation retains the same clinical contract in five clear sections", () => {
  const builder = (contract as Record<string, unknown>).buildSunburstPrompt;
  assert.equal(typeof builder, "function");
  const build = builder as (s: typeof contractExamples[string]) => string;
  const whitening = build(contractExamples.Whitening), veneers = build(contractExamples.Porcelain), alignment = build(contractExamples.Alignment), arch = build(contractExamples["Full Arch preserve gingiva"]);
  for (const prompt of [whitening, veneers, alignment, arch]) {
    for (const heading of ["TASK", "CHANGE", "PRESERVE", "STYLE", "EDIT REGION"]) assert.equal(prompt.match(new RegExp("^" + heading + "$", "gm"))?.length, 1);
    assert.match(prompt, /mouth opening/); assert.match(prompt, /original.*framing/);
    assert.doesNotMatch(prompt, /black-and-white guidance mask|final image is.*mask/);
  }
  assert.match(whitening, /colour\/shade change only/); assert.doesNotMatch(whitening, /GOAL SCOPE|DESIGN: shape/);
  assert.match(veneers, /Porcelain/); assert.match(veneers, /RESHAPE/); assert.match(veneers, /shade/); assert.match(veneers, /untreated teeth/);
  assert.match(alignment, /ALIGNMENT ONLY/); assert.match(alignment, /keeps its crown shape, size, incisal edge, wear, texture and shade/); assert.doesNotMatch(alignment, /Porcelain|Bleach|DESIGN: shape/);
  assert.match(arch, /upper and lower full-arch fixed zirconia/); assert.match(arch, /existing natural gum line/); assert.doesNotMatch(arch, /14, 13, 12/);
  assert.match(build(contractExamples["Full Arch include prosthetic gingiva"]), /explicit interface exception|EXPLICIT EXCEPTION/);
});

test("Sunburst results retain pipeline and treatment version metadata for case persistence", async () => {
  const image = "data:image/jpeg;base64," + readFileSync("public/sample-smile.jpg").toString("base64");
  const result = await generateSmile({ originalImage: image, settings: contractExamples.Porcelain }, undefined, { name: "openai", vendor: "openai", model: "gpt-image-2.5-sunburst", generate: async () => ({ image, mode: "live", variationId: crypto.randomUUID() }) });
  assert.equal(result.generation?.pipelineVersion, "SC-SUNBURST-V1");
  assert.equal(result.generation?.treatmentPromptVersion, "VENEERS-V1");
});
