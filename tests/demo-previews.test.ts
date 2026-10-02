import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { demoPreviewAsset } from "../src/lib/demoPreviews";
import { DEFAULT_FULL_ARCH, defaultSettings, type SmileSettings, type ToothShape } from "../src/lib/types";

const shapes: ToothShape[] = ["Square", "Rounded", "Triangular"];
const materials: SmileSettings["treatment"][] = ["Single-shade composite", "Layered composite", "Porcelain"];
const digest = (src: string) => createHash("sha256").update(readFileSync(`public${src}`)).digest("hex");

test("demo shapes and materials resolve to nine separately bundled photographs", () => {
  const samples = shapes.flatMap(shape => materials.map(treatment => demoPreviewAsset({ ...defaultSettings, shape, treatment })));
  assert.equal(new Set(samples.map(sample => sample.src)).size, 9);
  assert.equal(new Set(samples.map(sample => digest(sample.src))).size, 9);
  assert.equal(demoPreviewAsset({ ...defaultSettings, treatment: "Composite" }).src, demoPreviewAsset({ ...defaultSettings, treatment: "Single-shade composite" }).src);
});

test("alignment only selects its own original-shade example regardless of restorative settings", () => {
  const sample = demoPreviewAsset({ ...defaultSettings, alignment: { arches: "Upper", only: true }, treatment: "Porcelain" });
  for (const shape of shapes) assert.equal(demoPreviewAsset({ ...defaultSettings, shape, alignment: { arches: "Both", only: true } }).src, sample.src);
  assert.notEqual(digest(sample.src), digest(demoPreviewAsset({ ...defaultSettings, treatment: "Porcelain" }).src));
  assert.notEqual(demoPreviewAsset({ ...defaultSettings, alignment: { arches: "Upper" }, treatment: "Porcelain" }).src, sample.src);
});

test("full-arch zirconia wins over stale porcelain or alignment and has three distinct forms", () => {
  const samples = shapes.map(shape => demoPreviewAsset({ ...defaultSettings, shape, treatment: "Porcelain", alignment: { arches: "Both", only: true }, treatmentMode: "full_arch", fullArch: DEFAULT_FULL_ARCH }));
  assert.equal(new Set(samples.map(sample => digest(sample.src))).size, 3);
  assert.ok(samples.every(sample => !materials.some(treatment => digest(demoPreviewAsset({ ...defaultSettings, treatment }).src) === digest(sample.src))));
});

test("the upper-only demo never misrepresents hidden lower teeth or zirconia as a provisional", () => {
  assert.throws(() => demoPreviewAsset({ ...defaultSettings, alignment: { arches: "Lower", only: true } }), /does not show the lower teeth/);
  assert.throws(() => demoPreviewAsset({ ...defaultSettings, treatmentMode: "full_arch", fullArch: { ...DEFAULT_FULL_ARCH, arch: "lower" } }), /does not show the lower teeth/);
  assert.throws(() => demoPreviewAsset({ ...defaultSettings, treatmentMode: "full_arch", fullArch: { ...DEFAULT_FULL_ARCH, restorationType: "provisional" } }), /provisional restorations are not simulated/);
});
