import test from "node:test";
import assert from "node:assert/strict";
import { assessQuality } from "../src/lib/qualityCheck";
import { defaultSettings } from "../src/lib/types";

/** A mouth opening (dark) with a row of upper teeth separated by gaps, on skin. */
function mouth(opts: { toothBottom?: number; tooth?: number[]; band?: [number, number] } = {}) {
  const W = 240, H = 140, rgba = new Uint8ClampedArray(W * H * 4), opening = new Uint8Array(W * H);
  const bottom = opts.toothBottom ?? 80, tooth = opts.tooth ?? [225, 220, 205];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inMouth = x >= 30 && x < 210 && y >= 40 && y < 110;
    let c = [200, 150, 130];
    if (inMouth) { opening[i] = 1; c = [40, 20, 25]; if (y < bottom && (x - 30) % 22 < 20) c = tooth; }
    if (opts.band && inMouth && y >= opts.band[0] && y < opts.band[1]) c = [170, 80, 90];
    rgba.set([...c, 255], i * 4);
  }
  return { rgba, opening, W, H };
}

test("a faithful, lighter result passes", () => {
  const o = mouth(), f = mouth({ tooth: [240, 238, 232] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain" }, f.rgba);
  assert.equal(r.passed, true, JSON.stringify(r));
});

test("a strip of lip pasted across the service's teeth is a seam", () => {
  const o = mouth(), service = mouth({ tooth: [240, 238, 232] }), f = mouth({ tooth: [240, 238, 232], band: [60, 66] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain" }, service.rgba);
  assert.ok(r.issues.includes("seam"), JSON.stringify(r));
});

test("veneers that end well below the photographed edge are flagged as longer", () => {
  const o = mouth({ toothBottom: 70 }), f = mouth({ toothBottom: 82, tooth: [240, 238, 232] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain" }, f.rgba);
  assert.ok(r.issues.includes("longer"), JSON.stringify(r));
});

test("teeth darker than photographed fail when a lighter shade was asked for", () => {
  const o = mouth(), f = mouth({ tooth: [180, 170, 150] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, targetShade: "Whiten" }, f.rgba);
  assert.ok(r.issues.includes("darker") || r.issues.includes("yellow"), JSON.stringify(r));
});

test("much lighter teeth with a slight warm shift are not called yellow", () => {
  const o = mouth({ tooth: [200, 198, 192] }), f = mouth({ tooth: [240, 236, 224] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain", targetShade: "Whiten" }, f.rgba);
  assert.ok(!r.issues.includes("yellow"), JSON.stringify(r));
});

test("teeth made yellower at the same lightness are called yellow", () => {
  const o = mouth(), f = mouth({ tooth: [230, 220, 178] });
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain", targetShade: "Whiten" }, f.rgba);
  assert.ok(r.issues.includes("yellow"), JSON.stringify(r));
});

test("a close-up whose painted edge meets a very different redraw fails as a join", () => {
  // The painted area is the mouth; below it the service drew teeth where the photo has lip.
  const o = mouth(), service = mouth({ tooth: [240, 238, 232] }), f = mouth({ tooth: [240, 238, 232] });
  for (let y = 110; y < 118; y++) for (let x = 30; x < 210; x++) service.rgba.set([240, 238, 232, 255], (y * o.W + x) * 4);
  const r = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain", shotType: "Close-up" }, service.rgba);
  assert.ok(r.issues.includes("join"), JSON.stringify(r));
  const clean = assessQuality(o.rgba, f.rgba, o.W, o.H, o.opening, { ...defaultSettings, treatment: "Porcelain", shotType: "Close-up" }, f.rgba);
  assert.ok(!clean.issues.includes("join"), JSON.stringify(clean));
});

test("on a face photo, biting edges that disappear behind the lower lip fail", () => {
  // The photo shows the upper edges well above the lower lip; the final's teeth run on to the lip.
  const o = mouth({ toothBottom: 80 }), hidden = mouth({ toothBottom: 110, tooth: [240, 238, 232] }), shown = mouth({ toothBottom: 80, tooth: [240, 238, 232] });
  const settings = { ...defaultSettings, treatment: "Porcelain" as const, treatmentMode: "full_arch" as const, fullArch: { arch: "upper" as const, restorationType: "zirconia" as const, prostheticGingiva: "exclude" as const } };
  const r = assessQuality(o.rgba, hidden.rgba, o.W, o.H, o.opening, settings, hidden.rgba, true);
  assert.ok(r.issues.includes("edgesHidden"), JSON.stringify(r));
  const ok = assessQuality(o.rgba, shown.rgba, o.W, o.H, o.opening, settings, shown.rgba, true);
  assert.ok(!ok.issues.includes("edgesHidden"), JSON.stringify(ok));
});
