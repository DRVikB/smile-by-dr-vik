import { toothWeights } from "./whitening";

/**
 * Upper biting-edge guard for veneers and bonding.
 *
 * Image services tend to lengthen the upper front teeth even when told to keep
 * each edge where it is. After a result is aligned to the original photograph,
 * this compares where the upper front teeth end in each, column by column
 * across the central part of the mouth opening, and trims any extra length back
 * to the original edge line (plus a small tolerance) by restoring the original
 * pixels below it: the dark space or lower teeth that were there before.
 *
 * It is deliberately cautious: it changes nothing unless the upper teeth can be
 * measured clearly in both images (a visible gap below the upper edges, enough
 * columns agreeing) and the extra length is modest and consistent. A result that
 * is already within tolerance, or that cannot be measured, is left untouched.
 *
 * The line it trims to is a smooth curve along the longest nearby original
 * edges, never each column's own edge: a chipped or worn tooth may be restored
 * to its neighbours' level, and the cut can't follow a ragged edge. Where the
 * original edges are too uneven to give such a line (worn or broken-down
 * teeth, which the design is there to rebuild), nothing is trimmed at all.
 */

export interface EdgeGuardOptions {
  /** Share of the mouth opening's width, centred, that is checked (the anterior teeth). */
  span?: number;
  /** Extra length tolerated, as a share of the upper teeth's visible height. */
  tolerance?: number;
}

export interface EdgeGuardResult {
  pixels: Uint8ClampedArray;
  trimmed: boolean;
  /** Median extra length found, in pixels (0 when not measurable). */
  extraPx: number;
  /** Median visible height of the upper teeth in the original, in pixels. */
  toothHeightPx: number;
  /** Columns that could be measured in both images. */
  measured: number;
  reason: "trimmed" | "within-tolerance" | "unmeasurable" | "implausible" | "irregular";
}

type Run = readonly [start: number, end: number];

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * For each column of the opening, the upper teeth's run: from the first tooth
 * pixel near the top of the opening down to their biting edge. Null where the
 * upper teeth can't be told apart from what lies below (they reach the bottom
 * of the opening, for example meeting the lower teeth).
 */
export function upperTeethRuns(weights: Float32Array, opening: Uint8Array, w: number, h: number, x0: number, x1: number): (Run | null)[] {
  const runs: (Run | null)[] = [];
  for (let x = x0; x <= x1; x++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) if (opening[y * w + x]) { if (top < 0) top = y; bottom = y; }
    if (top < 0 || bottom - top < 6) { runs.push(null); continue; }
    const height = bottom - top + 1;
    let start = -1;
    for (let y = top; y <= top + height * 0.45; y++) if (weights[y * w + x] > 0.5) { start = y; break; }
    if (start < 0) { runs.push(null); continue; }
    const maxGap = Math.max(2, Math.round(height * 0.04));
    let end = start, gap = 0;
    for (let y = start + 1; y <= bottom; y++) {
      if (weights[y * w + x] > 0.5) { end = y; gap = 0; }
      else if (++gap > maxGap) break;
    }
    runs.push(end >= bottom - Math.max(2, height * 0.06) ? null : [start, end]);
  }
  return runs;
}

export function guardUpperEdges(
  original: Uint8ClampedArray, result: Uint8ClampedArray, w: number, h: number, opening: Uint8Array, options: EdgeGuardOptions = {},
): EdgeGuardResult {
  const untouched = (reason: EdgeGuardResult["reason"], extraPx = 0, toothHeightPx = 0, measured = 0): EdgeGuardResult =>
    ({ pixels: result, trimmed: false, extraPx, toothHeightPx, measured, reason });
  if (original.length !== w * h * 4 || result.length !== w * h * 4 || opening.length !== w * h) return untouched("unmeasurable");

  let minX = w, maxX = -1;
  for (let i = 0; i < opening.length; i++) if (opening[i]) { const x = i % w; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  if (maxX - minX < 20) return untouched("unmeasurable");
  const span = options.span ?? 0.6;
  const inset = Math.round((maxX - minX) * (1 - span) / 2);
  const x0 = minX + inset, x1 = maxX - inset;

  const before = upperTeethRuns(toothWeights(original, w, h, opening).weights, opening, w, h, x0, x1);
  const after = upperTeethRuns(toothWeights(result, w, h, opening).weights, opening, w, h, x0, x1);
  const both = before.map((b, i) => (b && after[i] ? i : -1)).filter(i => i >= 0);
  if (both.length < before.length * 0.4) return untouched("unmeasurable", 0, 0, both.length);

  const toothHeight = median(both.map(i => before[i]![1] - before[i]![0]));

  // The original edge for every checked column, filling unmeasured columns from their neighbours.
  const edges = before.map(r => (r ? r[1] : NaN));
  for (let i = 0; i < edges.length; i++) {
    if (!Number.isNaN(edges[i])) continue;
    let l = i - 1, r = i + 1;
    while (l >= 0 && Number.isNaN(edges[l])) l--;
    while (r < edges.length && Number.isNaN(edges[r])) r++;
    edges[i] = l >= 0 && r < edges.length ? edges[l] + (edges[r] - edges[l]) * (i - l) / (r - l) : l >= 0 ? edges[l] : r < edges.length ? edges[r] : NaN;
  }
  // The limit: the longest original edge within about half a tooth either side, then smoothed.
  // (The checked span holds roughly six front teeth.)
  const reach = Math.max(2, Math.round(edges.length / 12));
  const longest = edges.map((_, i) => { let v = edges[i]; for (let k = Math.max(0, i - reach); k <= Math.min(edges.length - 1, i + reach); k++) if (edges[k] > v) v = edges[k]; return v; });
  const limitLine = longest.map((_, i) => { let sum = 0, n = 0; for (let k = Math.max(0, i - reach); k <= Math.min(edges.length - 1, i + reach); k++) { sum += longest[k]; n++; } return sum / n; });

  const extra = median(both.map(i => after[i]![1] - limitLine[i]));
  const tolerance = Math.max(2, Math.round(toothHeight * (options.tolerance ?? 0.05)));
  if (extra <= tolerance) return untouched("within-tolerance", Math.max(0, extra), toothHeight, both.length);
  // Far more than a design would add: something else is going on, so leave it alone.
  if (extra > toothHeight * 0.35) return untouched("implausible", extra, toothHeight, both.length);
  // Worn, chipped or uneven edges: there is no trustworthy line to hold the new teeth to, and
  // rebuilding those edges is the point of the design.
  const unevenness = median(both.map(i => limitLine[i] - before[i]![1]));
  if (unevenness > toothHeight * 0.1) return untouched("irregular", extra, toothHeight, both.length);

  const pixels = new Uint8ClampedArray(result);
  // How much of the original photograph shows at each pixel: a ramp below the new edge (about twice the
  // tolerance, so the edge fades rather than stops), then smoothed across neighbouring columns so a
  // trimmed tooth never ends in a step beside one that was left alone.
  const soft = Math.max(3, tolerance * 2);
  const runs = after.map((run, i) => (run && !Number.isNaN(limitLine[i]) ? { limit: Math.round(limitLine[i]) + tolerance, end: run[1] } : null)).map(r => (r && r.end > r.limit ? r : null));
  const cut = runs.filter((r): r is { limit: number; end: number } => r !== null);
  if (!cut.length) return { pixels, trimmed: false, extraPx: extra, toothHeightPx: toothHeight, measured: both.length, reason: "within-tolerance" };
  const blur = Math.max(2, Math.round(tolerance));
  const bx0 = Math.max(0, x0 - blur), bx1 = Math.min(w, x0 + after.length + blur);
  const by0 = Math.min(...cut.map(r => r.limit)) + 1, by1 = Math.min(h - 1, Math.max(...cut.map(r => r.end)) + 2);
  const bw = bx1 - bx0, bh = by1 - by0 + 1;
  const mix = new Float32Array(bw * bh);
  runs.forEach((r, i) => {
    if (!r) return;
    const x = x0 + i;
    for (let y = r.limit + 1; y <= Math.min(by1, r.end + 2); y++) if (opening[y * w + x]) mix[(y - by0) * bw + (x - bx0)] = Math.min(1, (y - r.limit) / soft);
  });
  const smooth = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let sum = 0, n = 0;
    for (let k = Math.max(0, x - blur); k <= Math.min(bw - 1, x + blur); k++) { sum += mix[y * bw + k]; n++; }
    smooth[y * bw + x] = sum / n;
  }
  let trimmed = false;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const m = smooth[y * bw + x], k = (y + by0) * w + (x + bx0);
    if (m <= 0 || !opening[k]) continue;
    for (let c = 0; c < 3; c++) pixels[k * 4 + c] = Math.round(pixels[k * 4 + c] * (1 - m) + original[k * 4 + c] * m);
    trimmed = true;
  }
  return { pixels, trimmed, extraPx: extra, toothHeightPx: toothHeight, measured: both.length, reason: trimmed ? "trimmed" : "within-tolerance" };
}
