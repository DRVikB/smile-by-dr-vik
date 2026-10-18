import type { SmileSettings } from "./types";
import { rgbToLab, toothWeights } from "./whitening";
import { upperTeethRuns } from "./edgeGuard";

/**
 * Quality control on a finished result, before it is shown. Each check compares the final image with
 * the original photograph (and, where given, with the image service's own result before the app
 * restored the face) inside the mouth opening, and names a visible defect:
 *  - seam:         the app's compositing cut through the new teeth (patient's lip or gap pasted over
 *                  them), seen as service tooth pixels that became non-tooth in the final;
 *  - longer:       the upper teeth end clearly lower than in the photo, or now run into the lower
 *                  teeth where the photo showed a gap (veneers and bonding have no length permission);
 *  - darker:       the teeth came out darker or more yellow than photographed when a lighter shade
 *                  (or no change) was asked for;
 *  - yellow:       the new teeth came out yellower than the photographed ones (a slight warm shift is
 *                  allowed when they are also clearly lighter), or beige for full arch;
 *  - othersChanged: upper teeth outside a 4- or 6-tooth design were whitened too;
 *  - shade:        the shade changed noticeably although Keep was chosen;
 *  - lowerChanged: the lower teeth were whitened although only upper teeth were chosen;
 *  - join:         on a close-up, the edge of the painted area shows: just outside it the final keeps the
 *                  photo, but the service redrew that strip quite differently (a lower lip it moved down,
 *                  teeth it added), so the two pictures meet in a visible edge;
 *  - smudged:      the teeth lost most of their surface detail;
 *  - merged:       the separations between teeth largely disappeared (a band rather than teeth).
 * Thresholds were set on the clinic's test photos so the results the clinician judged poor fail and
 * the good ones pass. Pure pixel work; exported for tests.
 */
export type QualityIssue = "seam" | "join" | "longer" | "darker" | "yellow" | "shade" | "lowerChanged" | "othersChanged" | "smudged" | "merged";
export interface QualityReport {
  /** No defect that should stop the result being presented as it is. */
  passed: boolean;
  /** Defects. */
  issues: QualityIssue[];
  /** The design went beyond the selection (other teeth or the lower teeth changed, or the shade when Keep
   * was chosen): not a defect, worth pointing out so the clinician can choose. */
  notes: QualityIssue[];
  /** Measurements behind each decision, for QA only. */
  metrics: Record<string, number>;
}

export const QUALITY_MESSAGES: Record<QualityIssue, string> = {
  seam: "Part of the new teeth was cut off where they meet the lips.",
  join: "The edge of the painted area shows, because the lips were redrawn beyond it.",
  longer: "The new teeth look longer than the patient’s own.",
  darker: "The teeth came out darker or more yellow than the photo.",
  shade: "The shade changed although Keep was chosen.",
  yellow: "The new teeth look yellow or beige rather than clean and natural.",
  othersChanged: "Teeth that weren’t chosen changed too.",
  lowerChanged: "The lower teeth changed although only upper teeth were chosen.",
  smudged: "The teeth look smudged rather than sharp.",
  merged: "The teeth have merged together instead of looking separate.",
};

const SPILL_LIMIT = 0.06;
/** Share of the strip just outside a close-up's painted area where the photo kept meets a very different redraw. */
const JOIN_LIMIT = 0.08;

/** Two-pass chamfer distance (px) from each pixel to the nearest pixel of `area`, capped at `cap`. */
function distanceTo(area: Uint8Array, W: number, H: number, cap: number): Float32Array {
  const d = new Float32Array(W * H), D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = area[i] ? 0 : cap;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i]; if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i]; if (v === 0) continue;
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); }
    d[i] = v;
  }
  return d;
}
const NOTE_ISSUES = new Set<QualityIssue>(["lowerChanged", "othersChanged", "shade"]);
const lighterShades = new Set(["Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"]);

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Mean L*, b* of the tooth pixels (weight > 0.5) where `within` is set. */
function toothColour(rgba: Uint8ClampedArray, weights: Float32Array, within: (i: number) => boolean, n: number): { L: number; b: number; count: number } {
  let L = 0, B = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (weights[i] <= 0.5 || !within(i)) continue;
    const [l, , b] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    L += l; B += b; count++;
  }
  return count ? { L: L / count, b: B / count, count } : { L: 0, b: 0, count: 0 };
}

/** Surface detail: mean absolute Laplacian of brightness over tooth pixels away from their edges. */
function detail(rgba: Uint8ClampedArray, weights: Float32Array, W: number, H: number): number {
  let sum = 0, n = 0;
  const lum = (i: number) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (weights[i] < 0.9 || weights[i - 1] < 0.9 || weights[i + 1] < 0.9 || weights[i - W] < 0.9 || weights[i + W] < 0.9) continue;
    sum += Math.abs(4 * lum(i) - lum(i - 1) - lum(i + 1) - lum(i - W) - lum(i + W)); n++;
  }
  return n > 200 ? sum / n : NaN;
}

/** Separations between teeth along a row: dips in tooth weight between tooth runs. */
function separations(weights: Float32Array, W: number, y: number, x0: number, x1: number): number {
  let count = 0, inTooth = false, gap = 0;
  for (let x = x0; x <= x1; x++) {
    const v = weights[y * W + x];
    if (v > 0.6) { if (!inTooth && gap > 0) count++; inTooth = true; gap = 0; }
    else if (v < 0.35) { if (inTooth) gap++; inTooth = false; }
  }
  return count;
}

export function assessQuality(
  original: Uint8ClampedArray, final: Uint8ClampedArray, W: number, H: number, opening: Uint8Array, settings: SmileSettings,
  raw?: Uint8ClampedArray | null, lipLine = false,
): QualityReport {
  const n = W * H, issues: QualityIssue[] = [], metrics: Record<string, number> = {};
  const veneers = settings.treatmentMode !== "full_arch" && !settings.alignment?.only && settings.treatment !== "Whitening";
  const before = toothWeights(original, W, H, opening).weights, after = toothWeights(final, W, H, opening).weights;

  // Columns of the opening; the centre 70% holds the front teeth that matter most.
  let minX = W, maxX = -1;
  for (let i = 0; i < n; i++) if (opening[i]) { const x = i % W; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  if (maxX - minX < 20) return { passed: true, issues, notes: [], metrics: { unmeasurable: 1 } };
  const inset = Math.round((maxX - minX) * 0.15), x0 = minX + inset, x1 = maxX - inset;
  const runsBefore = upperTeethRuns(before, opening, W, H, x0, x1);
  const runsAfter = upperTeethRuns(after, opening, W, H, x0, x1, true);
  const measured = runsBefore.map((r, i) => (r && runsAfter[i] ? i : -1)).filter(i => i >= 0);
  const toothHeight = median(measured.map(i => runsBefore[i]![1] - runsBefore[i]![0]));
  metrics.toothHeight = toothHeight;

  // Seam: where the service drew tooth, the final should still be tooth (away from the lip line).
  if (raw) {
    const rawWeights = toothWeights(raw, W, H, opening).weights;
    // Keep away from the opening's edge, where the soft join with the lips is expected.
    const edge = Math.max(3, Math.round((maxX - minX) * 0.02));
    let drawn = 0, lost = 0;
    for (let y = edge; y < H - edge; y++) for (let x = edge; x < W - edge; x++) {
      const i = y * W + x;
      if (!opening[i] || !opening[i - edge] || !opening[i + edge] || !opening[i - edge * W] || !opening[i + edge * W]) continue;
      if (rawWeights[i] > 0.7) { drawn++; if (after[i] < 0.3) lost++; }
    }
    metrics.seamLost = drawn ? lost / drawn : 0;
    // Along the lip line: where the service drew tooth just inside the opening, the final keeps it apart
    // from the narrow soft join. A cut along an inaccurate lip line loses a wide strip of it.
    let edgeDrawn = 0, edgeLost = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!opening[i]) continue;
      let near = false;
      for (let d = 1; d <= edge * 3 && !near; d += Math.max(1, Math.floor(edge / 2))) near = !opening[i - d * W] || !opening[i + d * W] || (x - d >= 0 && !opening[i - d]) || (x + d < W && !opening[i + d]);
      if (!near || rawWeights[i] <= 0.7) continue;
      edgeDrawn++; if (after[i] < 0.3) edgeLost++;
    }
    metrics.edgeLost = edgeDrawn ? edgeLost / edgeDrawn : 0;
    // Just outside the lip line (face photos): teeth the service drew where the photo shows lip are cut
    // off by the patient's restored lip, which reads as clipped teeth when the line is off.
    if (lipLine) {
      const ring = new Uint8Array(n);
      const r = edge * 2;
      for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
        const i = y * W + x;
        if (opening[i]) continue;
        for (let d = 1; d <= r; d++) if (opening[i - d * W] || opening[i + d * W] || opening[i - d] || opening[i + d]) { ring[i] = 1; break; }
      }
      const rawRing = toothWeights(raw, W, H, ring).weights, finalRing = toothWeights(final, W, H, ring).weights;
      let ringPixels = 0, spilled = 0;
      for (let i = 0; i < n; i++) if (ring[i]) { ringPixels++; if (rawRing[i] > 0.7 && finalRing[i] < 0.3) spilled++; }
      metrics.spill = ringPixels ? spilled / ringPixels : 0;
    }
    if (!lipLine) {
      // A close-up's painted area: in a strip just outside it, where the final kept the photo but the
      // service drew something very different, the two pictures meet in a visible edge.
      const reach = Math.max(3, Math.round((maxX - minX) * 0.03));
      const near = distanceTo(opening, W, H, reach + 1);
      const lum = (a: Uint8ClampedArray, i: number) => 0.299 * a[i * 4] + 0.587 * a[i * 4 + 1] + 0.114 * a[i * 4 + 2];
      let strip = 0, mismatched = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const i = y * W + x;
        if (opening[i] || near[i] > reach) continue;
        strip++;
        const p = lum(original, i), s = lum(raw, i), f = lum(final, i);
        if (Math.abs(f - p) < Math.abs(f - s) && Math.abs(s - p) > 30) mismatched++;
      }
      metrics.joinMismatch = strip ? mismatched / strip : 0;
      if (strip > 200 && metrics.joinMismatch > JOIN_LIMIT) issues.push("join");
    }
    if ((drawn > 200 && metrics.seamLost > 0.04) || (edgeDrawn > 200 && metrics.edgeLost > 0.25) || (metrics.spill ?? 0) > SPILL_LIMIT) issues.push("seam");
  }

  // Longer: the new upper edge against the photographed one, where both can be measured.
  if (veneers && measured.length >= (x1 - x0 + 1) * 0.3 && toothHeight > 6) {
    const gapBefore = measured.filter(i => runsBefore[i]![1] < (runsAfter[i]![1])).length;
    const extra = median(measured.map(i => runsAfter[i]![1] - runsBefore[i]![1]));
    metrics.longer = extra / toothHeight;
    metrics.longerColumns = gapBefore / measured.length;
    if (extra / toothHeight > 0.18) issues.push("longer");
  }

  // Colour of the treated (upper) teeth.
  const upperZone = (i: number) => {
    const x = i % W, y = (i - x) / W, c = x - x0;
    if (c < 0 || c >= runsBefore.length) return false;
    const r = runsBefore[c];
    return r ? y <= r[1] : false;
  };
  const cBefore = toothColour(original, before, upperZone, n), cAfter = toothColour(final, after, upperZone, n);
  if (cBefore.count > 200 && cAfter.count > 200) {
    metrics.dL = cAfter.L - cBefore.L; metrics.db = cAfter.b - cBefore.b; metrics.L = cAfter.L; metrics.b = cAfter.b;
    const lighter = lighterShades.has(settings.targetShade) || settings.treatmentMode === "full_arch";
    if (settings.treatment !== "Whitening" && !settings.alignment?.only && (lighter ? metrics.dL < -3 : metrics.dL < -6)) issues.push("darker");
    // Teeth made clearly lighter with a slight warm shift read as brighter natural teeth, not yellow.
    const yellower = (metrics.db > 2.5 && metrics.dL < 6) || metrics.db > 5;
    if (lighter && settings.treatment !== "Whitening" && !settings.alignment?.only && (yellower || (settings.treatmentMode === "full_arch" && cAfter.b > 20))) issues.push("yellow");
    // Alignment alone moves teeth; it keeps their shade.
    if (settings.alignment?.only && settings.treatmentMode !== "full_arch" && Math.abs(metrics.dL) > 7) issues.push("shade");
    if (settings.targetShade === "The same" && settings.treatment !== "Whitening" && !settings.whitening && (Math.abs(metrics.dL) > 6 || metrics.db < -6)) issues.push("shade");
  }

  // Lower teeth: below the photographed upper edge, tooth pixels shouldn't get much lighter. Where the
  // arches touch (no gap), the edge is the thin darker line between them.
  const touching = upperTeethRuns(before, opening, W, H, x0, x1, true);
  const lum = (i: number) => 0.299 * original[i * 4] + 0.587 * original[i * 4 + 1] + 0.114 * original[i * 4 + 2];
  const split = touching.map((r, c) => {
    if (runsBefore[c]) return runsBefore[c]![1];
    if (!r || r[1] - r[0] < 12) return NaN;
    const x = x0 + c, from = Math.round(r[0] + (r[1] - r[0]) * 0.4), to = Math.round(r[0] + (r[1] - r[0]) * 0.85);
    let darkest = -1, low = Infinity, sum = 0, k = 0;
    for (let y = from; y <= to; y++) { const v = lum(y * W + x); sum += v; k++; if (v < low) { low = v; darkest = y; } }
    return k && low < (sum / k) * 0.85 ? darkest : NaN;
  });
  metrics.splitCols = split.filter(v => !Number.isNaN(v)).length / Math.max(1, split.length);
  metrics.touchCols = touching.filter(Boolean).length / Math.max(1, touching.length);
  if (veneers && !settings.lowerTeeth && split.some(v => !Number.isNaN(v))) {
    const edgeAt = (c: number) => split[c];
    const lowerZone = (i: number) => {
      const x = i % W, y = (i - x) / W, c = x - x0;
      if (c < 0 || c >= runsBefore.length) return false;
      const e = edgeAt(c);
      return !Number.isNaN(e) && y > e + Math.max(3, toothHeight * 0.1);
    };
    const lb = toothColour(original, before, lowerZone, n), la = toothColour(final, after, lowerZone, n);
    metrics.lowerCountBefore = lb.count; metrics.lowerCountAfter = la.count;
    if (lb.count > 120 && la.count > 120) {
      metrics.lowerDL = la.L - lb.L;
      if (metrics.lowerDL > 7) issues.push("lowerChanged");
    }
  }

  // Untreated upper teeth beside a 4- or 6-tooth design: the outer part of the upper teeth keeps its colour.
  if (veneers && !settings.toothPlans && (settings.teeth === 4 || settings.teeth === 6)) {
    const full = upperTeethRuns(before, opening, W, H, minX, maxX, true);
    const cols = full.map((r, c) => (r ? c : -1)).filter(c => c >= 0);
    if (cols.length > 20) {
      const left = cols[0], right = cols[cols.length - 1], span = right - left;
      const share = settings.teeth === 4 ? 0.42 : 0.62, keep = 0.06;
      const from = left + span * (0.5 - share / 2) - span * keep, to = left + span * (0.5 + share / 2) + span * keep;
      const outside = (i: number) => {
        const x = i % W, y = (i - x) / W, c = x - minX, run = full[c];
        if (!run || (c >= from && c <= to)) return false;
        return y >= run[0] && y <= run[0] + (run[1] - run[0]) * 0.6;
      };
      const ob = toothColour(original, before, outside, n), oa = toothColour(final, after, outside, n);
      if (ob.count > 150 && oa.count > 150) {
        metrics.othersDL = oa.L - ob.L;
        if (metrics.othersDL > 7) issues.push("othersChanged");
      }
    }
  }

  // Smudged: surface detail of the teeth against the photo's.
  const dBefore = detail(original, before, W, H), dAfter = detail(final, after, W, H);
  if (Number.isFinite(dBefore) && Number.isFinite(dAfter) && dBefore > 0) {
    metrics.detail = dAfter / dBefore;
    if (metrics.detail < 0.15) issues.push("smudged");
  }

  // Merged: separations along a row a third of the way down the upper teeth.
  const rows = measured.map(i => Math.round(runsBefore[i]![0] + (runsBefore[i]![1] - runsBefore[i]![0]) * 0.35));
  if (rows.length && settings.treatment !== "Whitening") {
    const y = median(rows);
    const sb = separations(before, W, y, x0, x1), sa = separations(after, W, y, x0, x1);
    metrics.sepBefore = sb; metrics.sepAfter = sa;
    if (sb >= 4 && sa < sb * 0.4) issues.push("merged");
  }

  const notes = issues.filter(i => NOTE_ISSUES.has(i)), defects = issues.filter(i => !NOTE_ISSUES.has(i));
  return { passed: defects.length === 0, issues: defects, notes, metrics };
}
