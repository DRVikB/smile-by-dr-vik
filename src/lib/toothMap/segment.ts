/**
 * On-device tooth segmentation, V1: classical image processing inside the
 * mouth opening. No model, no network — pure functions over RGBA pixels, so
 * it is tested without a browser.
 *
 *   mouth region → tooth pixels (bright, low redness, adaptive threshold)
 *   → upper tooth band per column → interproximal boundaries (dark valleys,
 *   incisal and gingival embrasure notches, gaps) → one region per tooth
 *   → FDI numbers outward from the midline → a confidence per tooth.
 *
 * It is a suggestion for the clinician to confirm: crowding, rotation and
 * heavy shadow can merge or split teeth, and those get low confidence.
 * Behind this interface a segmentation model can replace it later.
 */
export type Point = [number, number];

export interface SegmentInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** The mouth opening in these pixel coordinates; null means the whole image (a close-up). */
  mouth?: Point[] | null;
  /** The facial midline's x at tooth level, if a face was found. */
  midlineX?: number | null;
}

export interface DetectedTooth {
  index: number;
  outline: Point[];
  bbox: { x: number; y: number; w: number; h: number };
  centroid: Point;
  fdi: number | null;
  confidence: number;
}

export interface SegmentResult {
  teeth: DetectedTooth[];
  /** 1 where a pixel reads as tooth (for the debug view). */
  toothPixels: Uint8Array;
  /** Column positions of the boundaries between teeth. */
  boundaries: number[];
  /** Per column, the upper tooth band's top and bottom (−1 where none). For the debug view. */
  bandTop?: Int32Array;
  bandBottom?: Int32Array;
  threshold?: number;
}

/**
 * Expected visible width of each tooth in a frontal photo relative to a central incisor,
 * 1 (central) to 7 (second molar): the arch curves away, so each tooth further back looks narrower.
 */
export const RELATIVE_WIDTH = [1, 0.7, 0.58, 0.42, 0.34, 0.3, 0.26] as const;

export function fillPolygon(poly: Point[], width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  if (poly.length < 3) return out;
  const ys = poly.map(p => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Otsu's threshold over values in 0–255. */
export function otsu(values: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < values.length; i++) { hist[Math.max(0, Math.min(255, Math.round(values[i])))]++; n++; }
  if (!n) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** How much a pixel reads as tooth: bright and not red (gums, lips) or dark (the mouth). */
export function toothScore(r: number, g: number, b: number): number {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const redness = (r - g) / Math.max(1, l);
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  const penalty = Math.min(0.9, Math.max(0, (redness - 0.1) * 2.6) + Math.max(0, (saturation - 0.42) * 1.5));
  return l * (1 - penalty);
}

function movingAverage(values: Float64Array, radius: number): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) { s += values[k]; n++; }
    out[i] = n ? s / n : 0;
  }
  return out;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** Remove isolated specks: keep a pixel only if most of its 3×3 neighbourhood agrees. */
function despeckle(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += mask[(y + dy) * w + x + dx];
      out[y * w + x] = s >= 5 ? 1 : 0;
    }
  return out;
}

/** Peaks of `score` above `threshold`, strongest first, at least `minSep` apart. */
function peaks(score: Float64Array, valid: (i: number) => boolean, threshold: number, minSep: number, from: number, to: number): number[] {
  const candidates: number[] = [];
  for (let i = from + 1; i < to; i++) {
    if (!valid(i) && score[i] < 1.9) continue;
    if (score[i] >= threshold && score[i] >= score[i - 1] && score[i] >= score[i + 1]) candidates.push(i);
  }
  candidates.sort((a, b) => score[b] - score[a]);
  const chosen: number[] = [];
  for (const c of candidates) if (chosen.every(p => Math.abs(p - c) >= minSep)) chosen.push(c);
  return chosen.sort((a, b) => a - b);
}

/**
 * For a close-up (no face landmarks): the teeth's own region, so skin and
 * highlights elsewhere in the photo are never read as teeth. The largest
 * wide cluster of confident tooth pixels, with a margin; null if none.
 */
export function findTeethRegion(rgba: Uint8ClampedArray, w: number, h: number): Point[] | null {
  const score = new Float64Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) score[i] = toothScore(rgba[p], rgba[p + 1], rgba[p + 2]);
  const t = Math.max(otsu(score), quantile(Array.from(score.filter((_, i) => i % 7 === 0)), 0.98) * 0.5);
  const on = despeckle(Uint8Array.from(score, v => (v > t ? 1 : 0)), w, h);
  const seen = new Uint8Array(w * h);
  let best: { area: number; x0: number; x1: number; y0: number; y1: number } | null = null;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!on[start] || seen[start]) continue;
    let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % w, y = (i - x) / w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    const wide = (x1 - x0 + 1) / Math.max(1, y1 - y0 + 1) >= 1.4;
    if (wide && (!best || area > best.area)) best = { area, x0, x1, y0, y1 };
  }
  if (!best || best.area < w * h * 0.01) return null;
  const mx = (best.x1 - best.x0) * 0.12, my = (best.y1 - best.y0) * 0.25;
  const x0 = Math.max(0, best.x0 - mx), x1 = Math.min(w - 1, best.x1 + mx), y0 = Math.max(0, best.y0 - my), y1 = Math.min(h - 1, best.y1 + my);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function segmentTeeth(input: SegmentInput): SegmentResult {
  const { rgba, width: w, height: h } = input;
  const empty: SegmentResult = { teeth: [], toothPixels: new Uint8Array(w * h), boundaries: [] };
  if (w < 16 || h < 8) return empty;
  const region = input.mouth && input.mouth.length >= 3 ? fillPolygon(input.mouth, w, h) : new Uint8Array(w * h).fill(1);

  // 1. Tooth pixels: an adaptive threshold on the tooth score inside the mouth.
  const score = new Float64Array(w * h), lum = new Float64Array(w * h);
  const inside: number[] = [];
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    lum[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    if (!region[i]) continue;
    score[i] = toothScore(rgba[p], rgba[p + 1], rgba[p + 2]);
    inside.push(score[i]);
  }
  if (inside.length < 64) return empty;
  const top = quantile(inside, 0.98);
  const threshold = Math.max(otsu(inside), top * 0.42);
  // Hysteresis: shadowed teeth towards the corners read darker. Weaker tooth-like
  // pixels count when they join confident ones, or form a region of their own.
  const weakThreshold = threshold * 0.6;
  let pixels: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) pixels[i] = region[i] && score[i] > weakThreshold ? 1 : 0;
  pixels = despeckle(pixels, w, h);
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  const minArea = Math.max(12, Math.round(inside.length * 0.004));
  for (let start = 0; start < w * h; start++) {
    if (!pixels[start] || label[start] >= 0) continue;
    const members: number[] = [];
    let strong = 0;
    stack.push(start);
    label[start] = start;
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      if (score[i] > threshold) strong++;
      const x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && pixels[j] && label[j] < 0) { label[j] = start; stack.push(j); }
    }
    if (!strong && members.length < minArea) for (const i of members) pixels[i] = 0;
  }

  // 2. The upper tooth band in each column: the first run of tooth pixels from the top.
  const minRun = Math.max(3, Math.round(h * 0.035));
  const bandTop = new Int32Array(w).fill(-1), bandBottom = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      while (y < h && !pixels[y * w + x]) y++;
      if (y >= h) break;
      const start = y;
      let gap = 0;
      while (y < h && gap <= 1) { if (pixels[y * w + x]) gap = 0; else gap++; y++; }
      const end = y - gap - 1;
      if (end - start + 1 >= minRun) { bandTop[x] = start; bandBottom[x] = end; break; }
    }
  }
  const heights: number[] = [];
  for (let x = 0; x < w; x++) if (bandTop[x] >= 0) heights.push(bandBottom[x] - bandTop[x] + 1);
  if (heights.length < w * 0.08) return { ...empty, toothPixels: pixels };
  // Upper and lower teeth touching read as one tall run: cut at the dark occlusal line.
  const typical = quantile(heights, 0.5);
  for (let x = 0; x < w; x++) {
    if (bandTop[x] < 0) continue;
    const runH = bandBottom[x] - bandTop[x] + 1;
    if (runH < typical * 1.45) continue;
    let darkest = -1, darkestL = Infinity;
    for (let y = bandTop[x] + Math.round(runH * 0.45); y <= bandTop[x] + Math.round(runH * 0.92); y++) {
      const l = (lum[(y - 1) * w + x] + lum[y * w + x] + lum[Math.min(h - 1, y + 1) * w + x]) / 3;
      if (l < darkestL) { darkestL = l; darkest = y; }
    }
    if (darkest > 0) bandBottom[x] = darkest - 1;
  }

  // 3. The span of the band, trimmed of slivers at the corners of the mouth.
  const medH = quantile(heights.filter(v => v < typical * 1.45), 0.5) || typical;
  const valid = (x: number) => bandTop[x] >= 0 && bandBottom[x] - bandTop[x] + 1 >= medH * 0.3;
  let first = 0, last = w - 1;
  while (first < w && !valid(first)) first++;
  while (last > first && !valid(last)) last--;
  const span = last - first + 1;
  if (span < w * 0.1) return { ...empty, toothPixels: pixels };

  // 4. Boundary evidence per column: darker than its neighbours, embrasure notches, gaps.
  const colLum = new Float64Array(w), bottom = new Float64Array(w), topEdge = new Float64Array(w);
  const lums: number[] = [];
  for (let x = first; x <= last; x++) {
    if (!valid(x)) continue;
    let s = 0, n = 0;
    for (let y = bandTop[x]; y <= bandBottom[x]; y++) { s += lum[y * w + x]; n++; }
    colLum[x] = s / Math.max(1, n);
    lums.push(colLum[x]);
    bottom[x] = bandBottom[x];
    topEdge[x] = bandTop[x];
  }
  // Fill gaps with neighbours so the smoothing doesn't read them as notches.
  for (let x = first; x <= last; x++) if (!valid(x)) { colLum[x] = colLum[x - 1] || 0; bottom[x] = bottom[x - 1]; topEdge[x] = topEdge[x - 1]; }
  const medLum = quantile(lums, 0.5) || 1;
  const wide = Math.max(3, Math.round(span * 0.06));
  const bottomTrend = movingAverage(bottom, wide), topTrend = movingAverage(topEdge, wide), lumTrend = movingAverage(colLum, wide);
  const raw = new Float64Array(w);
  for (let x = first; x <= last; x++) {
    if (!valid(x)) { raw[x] = 2; continue; }
    const darker = Math.max(0, (lumTrend[x] - colLum[x]) / medLum) * 3.2;
    const incisal = Math.max(0, (bottomTrend[x] - bottom[x]) / medH) * 2.2;
    const gingival = Math.max(0, (topEdge[x] - topTrend[x]) / medH) * 1.6;
    raw[x] = darker + incisal + gingival;
  }
  const boundary = movingAverage(raw, Math.max(1, Math.round(span * 0.008)));
  for (let x = first; x <= last; x++) if (!valid(x)) boundary[x] = 2;
  const evidence = Array.from(boundary.slice(first, last + 1));
  const base = quantile(evidence, 0.5), high = quantile(evidence, 0.92);
  const threshold1 = base + (high - base) * 0.35;

  // 5. Boundaries: a first pass estimates tooth width, a second enforces it.
  let cuts = peaks(boundary, valid, threshold1, Math.max(2, span * 0.055), first, last);
  const centre = input.midlineX ?? (first + last) / 2;
  const segmentWidths = (list: number[]) => [first, ...list, last].slice(1).map((c, i) => c - [first, ...list][i]);
  const nearCentre = segmentWidths(cuts)
    .map((width, i) => ({ width, mid: ([first, ...cuts][i] + [...cuts, last][i]) / 2 }))
    .sort((a, b) => Math.abs(a.mid - centre) - Math.abs(b.mid - centre))
    .slice(0, 2).map(s => s.width);
  const central = Math.max(span * 0.1, Math.min(span * 0.32, quantile(nearCentre, 0.5) || span * 0.16));
  cuts = peaks(boundary, valid, threshold1, central * 0.45, first, last);
  // Split anything far too wide for its position at its strongest interior evidence.
  for (let pass = 0; pass < 3; pass++) {
    const bounds = [first, ...cuts, last];
    let changed = false;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i], b = bounds[i + 1];
      if (b - a <= central * 1.75) continue;
      let best = -1, bestScore = -Infinity;
      for (let x = a + Math.round(central * 0.4); x <= b - Math.round(central * 0.4); x++) if (boundary[x] > bestScore) { bestScore = boundary[x]; best = x; }
      if (best > 0) { cuts.push(best); changed = true; }
    }
    cuts.sort((p, q) => p - q);
    if (!changed) break;
  }

  // 6. Segments, dropping slivers at the ends.
  let segments = [first, ...cuts, last].slice(1).map((b, i) => ({ a: [first, ...cuts][i], b }));
  const meanHeight = (a: number, b: number) => {
    let s = 0, n = 0;
    for (let x = a; x <= b; x++) if (valid(x)) { s += bandBottom[x] - bandTop[x] + 1; n++; }
    return n ? s / n : 0;
  };
  segments = segments.filter((s, i) => {
    const end = i === 0 || i === segments.length - 1;
    const narrow = s.b - s.a < central * (end ? 0.28 : 0.16);
    return !narrow && meanHeight(s.a, s.b) >= medH * 0.3;
  });
  if (!segments.length) return { ...empty, toothPixels: pixels };

  // 7. The midline boundary: nearest the facial midline, else between the widest central pair.
  const findAnchor = (list: typeof segments) => {
    const inner = list.slice(1).map((s, i) => ({ x: s.a, left: list[i], right: s }));
    if (!inner.length) {
      // One tooth only: which side of the midline it sits on.
      return { index: (list[0].a + list[0].b) / 2 < centre ? 1 : 0, confidence: 0.4 };
    }
    const scored = inner.map((c, i) => {
      const distance = Math.abs(c.x - centre) / central;
      const pairWidth = (c.left.b - c.left.a + c.right.b - c.right.a) / (2 * central);
      return { i, distance, value: input.midlineX != null ? -distance : pairWidth - distance * 0.8 };
    });
    scored.sort((p, q) => q.value - p.value);
    const d = scored[0].distance;
    return { index: scored[0].i + 1, confidence: input.midlineX != null ? (d < 0.25 ? 1 : d < 0.6 ? 0.75 : 0.45) : 0.7 };
  };
  const anchor = findAnchor(segments);
  let anchorIndex = anchor.index;
  const anchorConfidence = anchor.confidence;
  // Towards the corners teeth narrow; two posterior teeth read as one when their width is far
  // beyond what their position expects. Split those at the strongest evidence inside.
  for (let pass = 0; pass < 2; pass++) {
    const centralNow = segments.filter((_, i) => i === anchorIndex - 1 || i === anchorIndex).map(s => s.b - s.a);
    const cw = centralNow.length ? centralNow.reduce((p, q) => p + q, 0) / centralNow.length : central;
    const next: typeof segments = [];
    let split = false;
    segments.forEach((seg, i) => {
      const n = i < anchorIndex ? anchorIndex - i : i - anchorIndex + 1;
      const expected = cw * RELATIVE_WIDTH[Math.min(6, n - 1)];
      if (n >= 3 && seg.b - seg.a > expected * 1.3) {
        // Search well inside the segment, so evidence bleeding in from its own edges can't cut a sliver.
        const margin = Math.max(Math.round(expected * 0.35), Math.round((seg.b - seg.a) * 0.25));
        let best = -1, bestScore = -Infinity;
        for (let x = seg.a + margin; x <= seg.b - margin; x++)
          if (boundary[x] > bestScore && boundary[x] >= boundary[x - 1] && boundary[x] >= boundary[x + 1]) { bestScore = boundary[x]; best = x; }
        // Only a genuine interior boundary: a peak well above this photo's typical evidence.
        if (best > 0 && bestScore >= base + (high - base) * 0.15) { next.push({ a: seg.a, b: best }, { a: best, b: seg.b }); split = true; return; }
      }
      next.push(seg);
    });
    if (!split) break;
    const anchorX = segments[anchorIndex]?.a ?? Infinity;
    segments = next;
    anchorIndex = segments.findIndex(seg => seg.a >= anchorX);
    if (anchorIndex < 0) anchorIndex = segments.length;
  }

  // 8. Numbers outward from the midline, then a confidence for each.
  const strength = (x: number) => {
    if (x <= first || x >= last) return 0.8;
    return Math.max(0, Math.min(1, (boundary[x] - base) / Math.max(1e-6, high - base)));
  };
  const withFdi = segments.map((s, i) => {
    const n = i < anchorIndex ? anchorIndex - i : i - anchorIndex + 1;
    const quadrant = i < anchorIndex ? 1 : 2;
    return { ...s, i, n, fdi: n <= 7 ? quadrant * 10 + n : null };
  });
  const centrals = withFdi.filter(s => s.n === 1).map(s => s.b - s.a);
  const centralWidth = centrals.length ? centrals.reduce((p, q) => p + q, 0) / centrals.length : central;
  const teeth: DetectedTooth[] = withFdi.map((s, index) => {
    const widthRatio = (s.b - s.a) / (centralWidth * RELATIVE_WIDTH[Math.min(6, s.n - 1)]);
    const plausibility = Math.exp(-(((widthRatio - 1) / 0.4) ** 2));
    let confidence = 0.35 + 0.35 * Math.min(strength(s.a), strength(s.b)) + 0.3 * plausibility;
    if (s.n <= 2) confidence *= 0.55 + 0.45 * anchorConfidence;
    if (s.n >= 4) confidence *= 0.9;
    if (s.n === 1 && centrals.length === 2 && Math.abs(centrals[0] - centrals[1]) / Math.max(...centrals) > 0.3) confidence *= 0.8;

    // Outline: the band's top edge left to right, then its bottom edge back, inset from the cuts.
    const a = s.a + (s.a > first ? 1 : 0), b = s.b - (s.b < last ? 1 : 0);
    const step = Math.max(1, Math.round((b - a) / 14));
    const topPts: Point[] = [], bottomPts: Point[] = [];
    for (let x = a; x <= b; x += step) {
      if (!valid(x)) continue;
      topPts.push([x, bandTop[x]]);
      bottomPts.push([x, bandBottom[x] + 1]);
    }
    if (valid(b) && topPts.at(-1)?.[0] !== b) { topPts.push([b, bandTop[b]]); bottomPts.push([b, bandBottom[b] + 1]); }
    const outline = [...topPts, ...bottomPts.reverse()];
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const centroid: Point = [xs.reduce((p, q) => p + q, 0) / xs.length, ys.reduce((p, q) => p + q, 0) / ys.length];
    return { index, outline, bbox, centroid, fdi: s.fdi, confidence: Math.max(0, Math.min(1, confidence)) };
  }).filter(t => t.outline.length >= 4);

  return { teeth, toothPixels: pixels, boundaries: cuts, bandTop, bandBottom, threshold };
}
