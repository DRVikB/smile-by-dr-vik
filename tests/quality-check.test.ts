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
