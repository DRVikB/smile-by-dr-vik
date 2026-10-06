import { toothWeights } from "../whitening";
import { DIVISIONS } from "./frame";

/*
 * Reads the patient's upper front teeth from a mouth image in which the line
 * between the corners of the mouth is horizontal (the caller rotates it so):
 *   - each column's upper-tooth run, from the top of the visible tooth (gum or
 *     lip) to its biting edge, cut at the shadow line where it meets the lower
 *     teeth;
 *   - a smooth, nearly level gum line and edge curve through those runs, which
 *     gaps (a missing tooth) and stray columns don't pull off;
 *   - the boundaries between teeth, from the darker interproximal lines and the
 *     notches in the biting edge between teeth;
 *   - the dental midline: the boundary nearest the facial midline.
 * The result is a design guide, so it stays regular: lateral and canine widths
 * keep believable proportions of the centrals and match side to side, and each
 * tooth's height follows the curves within a tolerance. Anything that can't be
 * read is filled from the owner's template proportions (central 1 : lateral
 * 0.71 : canine 0.54).
 */

export interface ToothRun { start: number; end: number; touching: boolean; long?: boolean }

export interface SmileMeasurement {
  /** First and last columns with upper teeth. */
  span: [number, number];
  /** Smooth gum line and edge curve (image rows) at any column. */
  gumAt: (x: number) => number;
  edgeAt: (x: number) => number;
  /** Tooth boundaries, left to right: canine | lateral | central | midline | central | lateral | canine. */
  boundaries: number[];
  /** Each tooth's top and biting edge (image rows), left to right. */
  teeth: [number, number][];
  /** How many of the seven boundaries were seen in the photo, rather than filled from proportions. */
  found: number;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Each column's upper-tooth run inside the opening, or null where there is none. */
export function toothRuns(weights: Float32Array, opening: Uint8Array, w: number, h: number): (ToothRun | null)[] {
  const runs: (ToothRun | null)[] = [];
  for (let x = 0; x < w; x++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) if (opening[y * w + x]) { if (top < 0) top = y; bottom = y; }
    if (top < 0 || bottom - top < 6) { runs.push(null); continue; }
    const height = bottom - top + 1;
    let start = -1;
    for (let y = top; y <= top + height * 0.5; y++) if (weights[y * w + x] > 0.5) { start = y; break; }
    if (start < 0) { runs.push(null); continue; }
    const maxGap = Math.max(2, Math.round(height * 0.04));
    let end = start, gap = 0;
    for (let y = start + 1; y <= bottom; y++) {
      if (weights[y * w + x] > 0.5) { end = y; gap = 0; }
      else if (++gap > maxGap) break;
    }
    runs.push(end - start < height * 0.15 ? null : { start, end, touching: end >= bottom - Math.max(2, height * 0.06) });
  }
  return runs;
}

/**
 * y = a + b·t + c·t², robust to outliers (embrasure notches, a gap, stray
 * columns): it starts from the median and down-weights large residuals from the
 * first pass. `tilt` and `bow` hold the slope and curvature back towards level.
 */
export function robustQuadratic(xs: number[], ys: number[], centre: number, scale: number, tilt = 1, bow = 0.15): (x: number) => number {
  let coef = [median(ys), 0, 0];
  for (let iteration = 0; iteration < 8; iteration++) {
    const residuals = xs.map((x, i) => ys[i] - evaluate(coef, (x - centre) / scale));
    const spread = Math.max(1.5, median(residuals.map(Math.abs)) * 1.4826);
    const weights = residuals.map(r => { const u = r / (3.5 * spread); return Math.abs(u) < 1 ? (1 - u * u) ** 2 : 0; });
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    let total = 0;
    xs.forEach((x, i) => {
      const t = (x - centre) / scale, row = [1, t, t * t], wt = weights[i];
      total += wt;
      for (let r = 0; r < 3; r++) { v[r] += wt * row[r] * ys[i]; for (let c = 0; c < 3; c++) m[r][c] += wt * row[r] * row[c]; }
    });
    if (total < 3) break;
    m[1][1] += tilt * total * 0.05; m[2][2] += bow * total * 0.05;
    const solved = solve3(m, v);
    if (!solved) break;
    coef = solved;
  }
  return x => evaluate(coef, (x - centre) / scale);
}
const evaluate = (c: number[], t: number) => c[0] + c[1] * t + c[2] * t * t;
function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) if (r !== col) { const f = a[r][col] / a[col][col]; for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c]; }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function boxSmooth(values: number[], radius: number): number[] {
  if (radius < 1) return values;
  return values.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) { sum += values[j]; n++; }
    return sum / n;
  });
}

/**
 * Measure the upper front teeth. `halfWidth` is half the mouth's width in this
 * image's pixels; `midline` is the facial midline's column (from the smile analysis).
 */
export function measureSmile(rgba: Uint8ClampedArray, w: number, h: number, opening: Uint8Array, halfWidth: number, midline: number): SmileMeasurement | null {
  if (rgba.length !== w * h * 4 || opening.length !== w * h || !(halfWidth > 10)) return null;
  const runs = toothRuns(toothWeights(rgba, w, h, opening).weights, opening, w, h);
  const luma = (x: number, y: number) => { const p = (y * w + x) * 4; return 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]; };

  // The visible teeth: the run of tooth columns around the midline (small gaps allowed).
  const near = Math.round(clamp(midline, 0, w - 1));
  let seed = -1;
  for (let d = 0; d < halfWidth * 0.3 && seed < 0; d++) for (const x of [near - d, near + d]) if (seed < 0 && x >= 0 && x < w && runs[x]) seed = x;
  if (seed < 0) return null;
  // A missing front tooth leaves a gap about a central's width.
  const allowGap = Math.max(2, Math.round(halfWidth * 0.3));
  const extend = (dir: 1 | -1) => {
    let x = seed, last = seed, gap = 0;
    while (x + dir >= 0 && x + dir < w && gap <= allowGap) { x += dir; if (runs[x]) { last = x; gap = 0; } else gap++; }
    return last;
  };
  const x0 = extend(-1), x1 = extend(1);
  if (x1 - x0 < halfWidth * 0.4) return null;
  const centre = (x0 + x1) / 2, scale = Math.max(1, (x1 - x0) / 2);
  const columns = () => { const c: number[] = []; for (let x = x0; x <= x1; x++) if (runs[x]) c.push(x); return c; };
  if (columns().length < (x1 - x0) * 0.5) return null;

  const fitCurves = () => {
    const cols = columns();
    const gumAt = robustQuadratic(cols, cols.map(x => runs[x]!.start), centre, scale);
    const clear = cols.filter(x => !runs[x]!.touching && !runs[x]!.long);
    const edgeCols = clear.length >= cols.length * 0.3 ? clear : cols.filter(x => !runs[x]!.long);
    const edgeAt = robustQuadratic(edgeCols, edgeCols.map(x => runs[x]!.end), centre, scale);
    return { cols, gumAt, edgeAt, height: median(cols.map(x => edgeAt(x) - gumAt(x))) };
  };

  /** Boundary evidence per column: darker than its surroundings across the crown, and notches in the edge. */
  const boundaryPeaks = (gumAt: (x: number) => number, edgeAt: (x: number) => number, height: number) => {
    const profile: number[] = [], notch: number[] = [];
    for (let x = x0; x <= x1; x++) {
      const run = runs[x];
      const top = run ? run.start : gumAt(x), bottom = run && !run.long ? run.end : edgeAt(x);
      const a = Math.round(top + (bottom - top) * 0.15), b = Math.round(top + (bottom - top) * 0.7);
      let sum = 0, n = 0;
      for (let y = Math.max(0, a); y <= Math.min(h - 1, b); y++) { sum += luma(x, y); n++; }
      profile.push(n ? sum / n : NaN);
      notch.push(run && !run.touching && !run.long ? Math.max(0, edgeAt(x) - run.end) / (height * 0.12) : 0);
    }
    for (let i = 0; i < profile.length; i++) if (Number.isNaN(profile[i])) profile[i] = i ? profile[i - 1] : profile.find(v => !Number.isNaN(v)) ?? 0;
    const smooth = boxSmooth(profile, Math.max(1, Math.round(halfWidth * 0.008)));
    const trend = boxSmooth(smooth, Math.max(2, Math.round(halfWidth * 0.06)));
    const spread = Math.max(1, median(smooth.map((v, i) => Math.abs(v - trend[i]))) * 1.4826);
    const notches = boxSmooth(notch, Math.max(1, Math.round(halfWidth * 0.01)));
    const score = smooth.map((v, i) => Math.max(0, trend[i] - v) / spread + Math.min(2, notches[i]));
    const radius = Math.max(2, Math.round(halfWidth * 0.04));
    const peaks: { x: number; s: number }[] = [];
    score.forEach((s, i) => {
      if (s < 0.8) return;
      for (let j = Math.max(0, i - radius); j <= Math.min(score.length - 1, i + radius); j++) if (score[j] > s || (score[j] === s && j < i)) return;
      peaks.push({ x: x0 + i, s });
    });
    return peaks;
  };

  const findBoundaries = (peaks: { x: number; s: number }[]) => {
    /** The best boundary between `from` and `to` (either order), preferring nearer `prior`. */
    const pick = (from: number, to: number, prior: number, window: number) => {
      const lo = Math.min(from, to), hi = Math.max(from, to);
      let best: { x: number; s: number } | null = null, bestValue = 0;
      for (const p of peaks) {
        if (p.x < lo || p.x > hi) continue;
        const value = p.s * (1 - 0.6 * Math.min(1, Math.abs(p.x - prior) / window));
        if (value > bestValue) { best = p; bestValue = value; }
      }
      return best;
    };
    let found = 0;
    const mid = pick(midline - halfWidth * 0.15, midline + halfWidth * 0.15, midline, halfWidth * 0.15);
    const m = mid && mid.s >= 1.2 ? (found++, mid.x) : midline;
    const prior = DIVISIONS[1] * halfWidth;
    const central = (dir: 1 | -1) => pick(m + dir * halfWidth * 0.15, m + dir * halfWidth * 0.36, m + dir * prior, halfWidth * 0.1);
    let cl = central(-1), cr = central(1);
    let wl = cl ? m - cl.x : prior, wr = cr ? cr.x - m : prior;
    // The two centrals are close in width: when they disagree, trust the clearer one.
    if (wl / wr < 0.8 || wl / wr > 1.25) {
      if ((cl?.s ?? 0) >= (cr?.s ?? 0)) { wr = wl; cr = null; } else { wl = wr; cl = null; }
    }
    found += (cl ? 1 : 0) + (cr ? 1 : 0);
    const cw = (wl + wr) / 2;
    // Laterals and canines: measured where seen, within design proportions of the centrals.
    const next = (from: number, dir: 1 | -1, lo: number, hi: number, ratio: number) => {
      const p = pick(from + dir * cw * lo, from + dir * cw * hi, from + dir * cw * ratio, cw * 0.25);
      return p ? Math.abs(p.x - from) : null;
    };
    const pair = (a: number | null, b: number | null, ratio: number) => {
      const fallback = cw * ratio;
      if (a !== null && b !== null && (a / b < 0.8 || a / b > 1.25)) { const mean = (a + b) / 2; return [mean, mean]; }
      return [a ?? b ?? fallback, b ?? a ?? fallback];
    };
    const cxl = m - wl, cxr = m + wr;
    const latL = next(cxl, -1, 0.6, 0.88, 0.71), latR = next(cxr, 1, 0.6, 0.88, 0.71);
    found += (latL !== null ? 1 : 0) + (latR !== null ? 1 : 0);
    const [ll, lr] = pair(latL, latR, 0.71);
    const canL = next(cxl - ll, -1, 0.4, 0.72, 0.54), canR = next(cxr + lr, 1, 0.4, 0.72, 0.54);
    found += (canL !== null ? 1 : 0) + (canR !== null ? 1 : 0);
    const [kl, kr] = pair(canL, canR, 0.54);
    return { boundaries: [cxl - ll - kl, cxl - ll, cxl, m, cxr, cxr + lr, cxr + lr + kr], cw, found };
  };

  // First pass: the curves and boundaries from the raw runs.
  let curves = fitCurves();
  if (!(curves.height > 4)) return null;
  let design = findBoundaries(boundaryPeaks(curves.gumAt, curves.edgeAt, curves.height));

  // Where the upper teeth run on into the lower teeth, cut each column at the
  // shadow line between them; a run far longer than a tooth with no such line
  // is left out of the edge.
  const { cw } = design;
  let cut = 0;
  for (const x of curves.cols) {
    const run = runs[x]!, length = run.end - run.start;
    if (!run.touching && length <= cw * 1.05) continue;
    const from = Math.round(run.start + cw * 0.55), to = Math.min(run.end - 2, Math.round(run.start + cw * 1.35));
    const level = (y: number) => { let s = 0, n = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h) { s += luma(xx, yy); n++; } } return s / n; };
    let valley = -1, darkest = Infinity;
    for (let y = from; y <= to; y++) { const l = level(y); if (l < darkest) { darkest = l; valley = y; } }
    if (valley > 0) {
      const above: number[] = [];
      for (let y = Math.round(run.start + length * 0.1); y < valley - cw * 0.1; y++) above.push(level(y));
      let after = 0;
      for (let y = valley + 2; y <= Math.min(run.end, valley + cw * 0.35); y++) after = Math.max(after, level(y));
      if (above.length > 2 && darkest < median(above) * 0.85 && after > darkest * 1.1) {
        runs[x] = { start: run.start, end: valley - 1, touching: false };
        cut++;
        continue;
      }
    }
    if (length > cw * 1.35) runs[x] = { ...run, long: true };
  }
  if (cut || curves.cols.some(x => runs[x]!.long)) {
    curves = fitCurves();
    if (!(curves.height > 4)) return null;
    design = findBoundaries(boundaryPeaks(curves.gumAt, curves.edgeAt, curves.height));
  }
  const { gumAt, edgeAt, height } = curves;
  const { boundaries, found } = design;

  // Each tooth's own top and edge, held within a tolerance of the curves.
  const teeth = boundaries.slice(0, 6).map((a, k): [number, number] => {
    const b = boundaries[k + 1], from = Math.round(a + (b - a) * 0.2), to = Math.round(a + (b - a) * 0.8);
    const tops: number[] = [], ends: number[] = [];
    for (let x = Math.max(0, from); x <= Math.min(w - 1, to); x++) {
      const run = runs[x];
      if (!run) continue;
      tops.push(run.start);
      if (!run.touching && !run.long) ends.push(run.end);
    }
    const xc = (a + b) / 2, g = gumAt(xc), e = edgeAt(xc);
    const top = tops.length >= 2 ? g + clamp(median(tops) - g, -height * 0.1, height * 0.1) : g;
    const bottom = ends.length >= 2 ? e + clamp(median(ends) - e, -height * 0.12, height * 0.12) : e;
    return bottom - top > height * 0.3 ? [top, bottom] : [g, e];
  });

  return { span: [x0, x1], gumAt, edgeAt, boundaries, teeth, found };
}

/**
 * For a close-up with no face to find: the mouth opening around the teeth (each
 * column from just above its top tooth pixel to just below its lowest). Of the
 * areas of tooth-coloured pixels, the teeth are the large one with lip or gum
 * (`red`) both above and below it, which pale skin around the mouth lacks.
 * Null when there is no clear area of teeth.
 */
export function openingFromTeeth(weights: Float32Array, red: Uint8Array, w: number, h: number): { opening: Uint8Array; x0: number; x1: number; y0: number; y1: number } | null {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const areas: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] >= 0 || weights[start] <= 0.5) continue;
    const id = areas.length;
    let head = 0, tail = 0;
    queue[tail++] = start; label[start] = id;
    while (head < tail) {
      const i = queue[head++], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || label[j] >= 0 || weights[j] <= 0.5) continue;
        label[j] = id; queue[tail++] = j;
      }
    }
    areas.push(tail);
  }
  // Per area and column: its top and bottom pixel.
  const reach = Math.max(2, Math.round(h * 0.04));
  const redNear = (x: number, y0: number, dir: 1 | -1) => {
    for (let d = 1; d <= reach; d++) { const y = y0 + dir * d; if (y >= 0 && y < h && red[y * w + x]) return true; }
    return false;
  };
  let best = -1, bestScore = 0;
  areas.forEach((area, id) => {
    if (area < w * h * 0.01) return;
    let columns = 0, enclosed = 0;
    for (let x = 0; x < w; x++) {
      let top = -1, bottom = -1;
      for (let y = 0; y < h; y++) if (label[y * w + x] === id) { if (top < 0) top = y; bottom = y; }
      if (top < 0) continue;
      columns++;
      if (redNear(x, top, -1) && redNear(x, bottom, 1)) enclosed++;
    }
    const score = (enclosed / Math.max(1, columns)) * Math.sqrt(area);
    if (enclosed / Math.max(1, columns) >= 0.3 && score > bestScore) { best = id; bestScore = score; }
  });
  if (best < 0) return null;
  const opening = new Uint8Array(w * h), margin = Math.max(2, Math.round(h * 0.03));
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let x = 0; x < w; x++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) if (label[y * w + x] === best) { if (top < 0) top = y; bottom = y; }
    if (top < 0) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, top); y1 = Math.max(y1, bottom);
    for (let y = Math.max(0, top - margin); y <= Math.min(h - 1, bottom + margin); y++) opening[y * w + x] = 1;
  }
  return x1 - x0 >= w * 0.25 ? { opening, x0, x1, y0, y1 } : null;
}
