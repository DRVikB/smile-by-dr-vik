import type { TargetShade } from "./types";

/**
 * Whitening on the device: a colour change applied to the photographed teeth.
 * Tooth outlines, edges, gaps and every other pixel keep their original
 * geometry, so a colour-only treatment can never redraw the smile.
 *
 * Pure pixel functions (no DOM) so they can be tested directly.
 */

// sRGB (D65) <-> CIELAB.
const toLinear = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const XN = 0.95047, ZN = 1.08883;

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / XN);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / ZN);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = XN * fInv(fx), Y = fInv(fy), Z = ZN * fInv(fz);
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [R, G, B].map(c => Math.max(0, Math.min(255, Math.round(fromLinear(Math.max(0, c)))))) as [number, number, number];
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Otsu threshold of values within [lo, hi]. */
function otsu(values: Float32Array, count: number, lo: number, hi: number, bins = 64): number {
  if (!count) return (lo + hi) / 2;
  const hist = new Float64Array(bins);
  for (let i = 0; i < count; i++) hist[Math.max(0, Math.min(bins - 1, Math.floor((values[i] - lo) / (hi - lo) * bins)))]++;
  let sum = 0; for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, at = bins / 2;
  for (let i = 0; i < bins; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = count - wB; if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; at = i; }
  }
  return lo + (at + 0.5) / bins * (hi - lo);
}

export interface ToothWeights { weights: Float32Array; teethPixels: number; regionPixels: number; hueCut: number; lightCut: number }

/**
 * How tooth-like each pixel inside `region` is (0–1). Teeth are the bright,
 * low-red pixels of the mouth opening: lips, gums and tongue are redder, and
 * the inside of the mouth is darker. Thresholds adapt to each photo.
 */
export function toothWeights(rgba: Uint8ClampedArray, width: number, height: number, region: Uint8Array): ToothWeights {
  const n = width * height;
  const L = new Float32Array(n), A = new Float32Array(n);
  const sample = new Float32Array(n);
  let regionPixels = 0, k = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!region[i]) continue;
    regionPixels++;
    const [l, a, b] = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    // Hue, not redness alone: even very yellow teeth lean yellow (b*), while
    // lips, gums and tongue lean red (a*).
    L[i] = l; A[i] = a - 0.6 * Math.max(0, b);
    if (l > 30) sample[k++] = A[i];
  }
  // Hue splits teeth from soft tissue; lightness splits teeth from the dark mouth.
  const aCut = Math.max(-4, Math.min(16, otsu(sample, k, -30, 40)));
  k = 0;
  for (let i = 0; i < n; i++) if (region[i] && A[i] < aCut) sample[k++] = L[i];
  // Otsu tends to split lit from shadowed teeth; the cut that matters is
  // teeth versus the dark inside of the mouth, so sit below it.
  const lCut = Math.max(28, Math.min(50, 0.8 * otsu(sample, k, 0, 100)));
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) if (region[i]) raw[i] = smooth(aCut + 4, aCut - 4, A[i]) * smooth(lCut - 6, lCut + 6, L[i]);
  // Soften the edges a little (3×3, twice) so the colour change has no hard seam.
  let weights = raw;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!region[i]) continue;
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (region[j]) { s += weights[j]; c++; }
      }
      next[i] = s / c;
    }
    weights = next;
  }
  let teethPixels = 0;
  for (let i = 0; i < n; i++) if (weights[i] > 0.5) teethPixels++;
  return { weights, teethPixels, regionPixels, hueCut: aCut, lightCut: lCut };
}

/** Approximate CIELAB targets for the shade guide (photographic, not calibrated). */
const SHADES: Partial<Record<TargetShade, { L: number; b: number }>> = {
  A1: { L: 78, b: 16 }, B1: { L: 80, b: 12 }, BL3: { L: 84, b: 8 }, BL2: { L: 87, b: 6 }, BL1: { L: 90, b: 4 },
};

export interface WhiteningPlan { lift: number; yellow: number; from: { L: number; b: number } }

/** How much lighter and less yellow the teeth become; zero for "The same". */
export function whiteningPlan(rgba: Uint8ClampedArray, weights: Float32Array, shade: TargetShade, intensity: number): WhiteningPlan | null {
  const Ls: number[] = [], bs: number[] = [];
  for (let i = 0, p = 0; i < weights.length; i++, p += 4) {
    if (weights[i] < 0.7) continue;
    const [l, , b] = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    Ls.push(l); bs.push(b);
  }
  if (Ls.length < 50 || shade === "The same") return null;
  const median = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)];
  const from = { L: median(Ls), b: median(bs) };
  const target = shade === "Whiten" ? { L: from.L + 7, b: from.b * 0.55 }
    : shade === "Bleach" ? { L: from.L + 13, b: from.b * 0.3 }
      : SHADES[shade] ?? { L: from.L, b: from.b };
  // Strength scales the change; whitening never darkens or adds yellow.
  const k = 0.5 + 0.5 * Math.max(0, Math.min(100, intensity)) / 100;
  return { from, lift: Math.max(0, Math.min(96, target.L) - from.L) * k, yellow: Math.max(0, from.b - target.b) * k };
}

/** Apply the plan to the weighted tooth pixels. Returns a new pixel array. */
export function whitenPixels(rgba: Uint8ClampedArray, weights: Float32Array, plan: WhiteningPlan): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  const headroom = Math.max(1, 100 - plan.from.L);
  for (let i = 0, p = 0; i < weights.length; i++, p += 4) {
    const w = weights[i];
    if (w <= 0.01) continue;
    const [l, a, b] = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    // Lighter in proportion to each pixel's own headroom, so shading and
    // translucency survive; yellow falls in proportion to its own amount.
    // Shadowed tooth surfaces lighten less, so depth between teeth survives.
    const depth = smooth(plan.from.L - 45, plan.from.L - 10, l);
    const L2 = Math.min(97, l + w * depth * plan.lift * (100 - l) / headroom);
    const yellowShare = plan.from.b > 1 ? Math.max(0, Math.min(1.5, b / plan.from.b)) : 1;
    const b2 = b - w * plan.yellow * yellowShare;
    const a2 = a * (1 - 0.25 * w * Math.min(1, plan.yellow / 10));
    const [r, g, bl] = labToRgb(L2, a2, b2);
    out[p] = r; out[p + 1] = g; out[p + 2] = bl;
  }
  return out;
}
