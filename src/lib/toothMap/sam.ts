import { resampleClosed, type Point } from "./outline";
import { fillPolygon } from "./segment";
import type { ToothMap, ToothRegion } from "./types";

/*
 * SlimSAM refinement (Segment Anything, compressed; Apache-2.0), on the device.
 *
 * The classical detector finds roughly where each tooth is and numbers it.
 * SlimSAM then traces each tooth's real crown edge: the mouth is encoded
 * once, and each tooth is prompted with its rough box, a point on the tooth
 * and "not this" points on its neighbours and the lips. A traced outline
 * replaces the rough one only when it is believable; otherwise the rough
 * outline stays and the tooth is flagged for checking.
 *
 * Runtime-agnostic: the two ONNX sessions are passed in (onnxruntime-web in
 * the app, onnxruntime-node in tests), so the same code runs in both.
 */

export const SAM_SIZE = 1024;
/** Visible widths relative to the central, from the midline outward (natural proportions). */
const RELATIVE = [1, 0.72, 0.62, 0.48, 0.4];
/** Visible crown heights relative to the central. */
const HEIGHT = [1, 0.86, 0.96, 0.82, 0.76];
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

export interface SamTensor { data: Float32Array | BigInt64Array | Int32Array | Uint8Array; dims: readonly number[] }
export interface SamRuntime {
  tensor: (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: number[]) => unknown;
  encoder: { run: (feeds: Record<string, unknown>) => Promise<Record<string, SamTensor>> };
  decoder: { run: (feeds: Record<string, unknown>) => Promise<Record<string, SamTensor>> };
}

/** Resize so the longest side is 1024, normalise, pad bottom-right: the model's input. */
export function samPixels(rgba: Uint8ClampedArray, width: number, height: number): { pixels: Float32Array; scale: number } {
  const scale = SAM_SIZE / Math.max(width, height);
  const rw = Math.round(width * scale), rh = Math.round(height * scale);
  const out = new Float32Array(3 * SAM_SIZE * SAM_SIZE);
  const plane = SAM_SIZE * SAM_SIZE;
  for (let y = 0; y < rh; y++) {
    const sy = Math.min(height - 1, (y + 0.5) / scale - 0.5);
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(height - 1, y0 + 1), fy = Math.max(0, sy - y0);
    for (let x = 0; x < rw; x++) {
      const sx = Math.min(width - 1, (x + 0.5) / scale - 0.5);
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(width - 1, x0 + 1), fx = Math.max(0, sx - x0);
      for (let c = 0; c < 3; c++) {
        const a = rgba[(y0 * width + x0) * 4 + c], b = rgba[(y0 * width + x1) * 4 + c];
        const d = rgba[(y1 * width + x0) * 4 + c], e = rgba[(y1 * width + x1) * 4 + c];
        const v = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
        out[c * plane + y * SAM_SIZE + x] = (v / 255 - MEAN[c]) / STD[c];
      }
    }
  }
  return { pixels: out, scale };
}

export interface ToothPrompt {
  /** Crown box in the crop's pixels (x0, y0, x1, y1), or none when the rough region can't be trusted. */
  box: [number, number, number, number] | null;
  positive: Point[];
  negative: Point[];
}

/** One prompt → SAM's three candidate masks with its quality scores, as boolean grids over the crop. */
async function segmentOne(rt: SamRuntime, embeddings: Record<string, SamTensor>, prompt: ToothPrompt, scale: number, width: number, height: number): Promise<{ mask: Uint8Array; score: number }[]> {
  // SAM's convention: labels 1 = on the object, 0 = not the object, 2 / 3 = box corners; −1 pads a point-only prompt.
  const corners: Point[] = prompt.box ? [[prompt.box[0], prompt.box[1]], [prompt.box[2], prompt.box[3]]] : [[0, 0]];
  const points: Point[] = [...prompt.positive, ...prompt.negative, ...corners];
  const labels = [...prompt.positive.map(() => 1), ...prompt.negative.map(() => 0), ...(prompt.box ? [2, 3] : [-1])];
  const feeds = {
    image_embeddings: embeddings.image_embeddings,
    image_positional_embeddings: embeddings.image_positional_embeddings,
    input_points: rt.tensor("float32", Float32Array.from(points.flatMap(([x, y]) => [x * scale, y * scale])), [1, 1, points.length, 2]),
    input_labels: rt.tensor("int64", BigInt64Array.from(labels.map(BigInt)), [1, 1, labels.length]),
  };
  const out = await rt.decoder.run(feeds);
  const scores = out.iou_scores.data as Float32Array;
  const logits = out.pred_masks.data as Float32Array;
  const [, , n, mh, mw] = out.pred_masks.dims;
  // pred_masks cover the padded 1024 square at 256×256: upsample the part over the crop.
  const k = SAM_SIZE / mw;
  const candidates: { mask: Uint8Array; score: number }[] = [];
  for (let m = 0; m < n; m++) {
    const mask = new Uint8Array(width * height);
    const base = m * mh * mw;
    for (let y = 0; y < height; y++) {
      const gy = (y * scale) / k - 0.5;
      const y0 = Math.max(0, Math.floor(gy)), y1 = Math.min(mh - 1, y0 + 1), fy = Math.max(0, gy - y0);
      for (let x = 0; x < width; x++) {
        const gx = (x * scale) / k - 0.5;
        const x0 = Math.max(0, Math.floor(gx)), x1 = Math.min(mw - 1, x0 + 1), fx = Math.max(0, gx - x0);
        const v = (logits[base + y0 * mw + x0] * (1 - fx) + logits[base + y0 * mw + x1] * fx) * (1 - fy)
          + (logits[base + y1 * mw + x0] * (1 - fx) + logits[base + y1 * mw + x1] * fx) * fy;
        if (v > 0) mask[y * width + x] = 1;
      }
    }
    candidates.push({ mask, score: scores[m] });
  }
  return candidates;
}

/**
 * Where an upper crown joins the lower tooth beneath it, the joined shape
 * narrows (the incisal edge meets the lower tooth). Cut at the narrowest row
 * in the band where the incisal edge can be.
 */
export function cutAtWaist(mask: Uint8Array, width: number, height: number, from: number, to: number): void {
  const rows: number[] = [];
  let top = -1;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) n += mask[y * width + x];
    rows.push(n);
    if (n && top < 0) top = y;
  }
  if (top < 0) return;
  const lo = Math.min(height - 1, top + Math.round(from)), hi = Math.min(height - 1, top + Math.round(to));
  const widest = Math.max(...rows.slice(top, lo + 1), 1);
  let cut = -1, narrowest = Infinity;
  for (let y = lo; y <= hi; y++) if (rows[y] < narrowest) { narrowest = rows[y]; cut = y; }
  // Only a real waist (or the band's end, for a joined shape that never narrows).
  const bottom = rows.findLastIndex(n => n > 0);
  if (bottom <= hi && narrowest > widest * 0.6) return;
  if (narrowest > widest * 0.6) cut = hi;
  for (let y = cut; y < height; y++) mask.fill(0, y * width, (y + 1) * width);
}

/** The largest 4-connected component. */
function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const label = new Int32Array(width * height);
  let bestId = 0, bestSize = 0, id = 0;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    id++;
    let size = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % width, y = (p - x) / width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && mask[q] && !label[q]) { label[q] = id; stack.push(q); }
      }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (label[i] === bestId && bestId) out[i] = 1;
  return out;
}

/** Trace the actual outside boundary, retaining notches rather than filling a convex hull. */
export function maskContour(mask: Uint8Array, width: number, height: number, samples = 256): Point[] {
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const add = (a: number, b: number) => { const list = edges.get(a) ?? []; list.push(b); edges.set(a, list); };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const a = y * stride + x, b = a + 1, c = b + stride, d = a + stride;
      if (!y || !mask[i - width]) add(a, b);
      if (x === width - 1 || !mask[i + 1]) add(b, c);
      if (y === height - 1 || !mask[i + width]) add(c, d);
      if (!x || !mask[i - 1]) add(d, a);
    }
  }
  let outer: Point[] = [], largest = 0;
  while (edges.size) {
    const start = edges.keys().next().value!;
    const loop: Point[] = [];
    let vertex = start;
    do {
      loop.push([vertex % stride, Math.floor(vertex / stride)]);
      const next = edges.get(vertex);
      if (!next?.length) break;
      const to = next.pop()!;
      if (!next.length) edges.delete(vertex);
      vertex = to;
    } while (vertex !== start);
    // Holes have the opposite winding; disconnected fragments are smaller.
    const area = loop.reduce((sum, p, i) => { const q = loop[(i + 1) % loop.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (area > largest) { largest = area; outer = loop; }
  }
  return outer.length < 3 ? outer : resampleClosed(outer, Math.min(256, samples));
}

export interface RefineStats { refined: number; kept: number; ms: number; reasons: Record<string, string> }

/**
 * Trace each detected tooth's crown with SlimSAM. `rgba` is the photo (or a
 * crop of it) with its size; `origin` and `photoSize` place that crop in the
 * photo so outlines stay in the map's normalised coordinates.
 */
export async function refineWithSam(rt: SamRuntime, map: ToothMap, image: { rgba: Uint8ClampedArray; width: number; height: number; origin: Point; photoWidth: number; photoHeight: number }): Promise<{ map: ToothMap; stats: RefineStats }> {
  const start = Date.now();
  const { rgba, width, height, origin, photoWidth, photoHeight } = image;
  const toCrop = ([x, y]: [number, number]): Point => [x * photoWidth - origin[0], y * photoHeight - origin[1]];
  const toNorm = ([x, y]: Point): [number, number] => [(x + origin[0]) / photoWidth, (y + origin[1]) / photoHeight];
  const { pixels, scale } = samPixels(rgba, width, height);
  const embeddings = await rt.encoder.run({ pixel_values: rt.tensor("float32", pixels, [1, 3, SAM_SIZE, SAM_SIZE]) });

  // The mouth opening, rasterised: a tooth may not spill onto the lips or skin.
  const lip = map.mouthOpening?.map(toCrop) ?? null;
  const inside = lip ? fillPolygon(lip, width, height) : null;
  const visible = map.teeth.filter(t => t.visible && t.outline.length >= 3);
  const sorted = [...visible].sort((a, b) => a.centroid.x - b.centroid.x);
  const boxes = new Map(visible.map(t => {
    const pts = t.outline.map(toCrop);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [t.id, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }] as const;
  }));
  const lipTop = lip ? Math.min(...lip.map(p => p[1])) : 0;
  const mouthW = lip ? Math.max(...lip.map(p => p[0])) - Math.min(...lip.map(p => p[0])) : width * 0.7;

  // Expected size of each tooth: from the centrals when they look right, else from the mouth.
  // Two centrals of matching width are trusted as they are (close-ups can make the mouth estimate unreliable).
  const rawCentrals = visible.filter(t => t.fdi === 11 || t.fdi === 21).map(t => { const b = boxes.get(t.id)!; return b.x1 - b.x0; });
  const matching = rawCentrals.length === 2 && Math.min(...rawCentrals) / Math.max(...rawCentrals) > 0.75 && Math.max(...rawCentrals) < mouthW * 0.4;
  const centralWidths = matching ? rawCentrals : rawCentrals.filter(w => w > mouthW * 0.07 && w < mouthW * 0.2);
  const centralW = centralWidths.length ? centralWidths.reduce((a, b) => a + b, 0) / centralWidths.length : mouthW * 0.125;
  const expectedW = (fdi: number | null) => centralW * (fdi ? RELATIVE[Math.min(4, (fdi % 10) - 1)] ?? 0.4 : 0.6);
  // Visible crown height: the centrals' own, when they look like single teeth; otherwise about 1.3× their width.
  const centralHeights = visible.filter(t => t.fdi === 11 || t.fdi === 21).map(t => { const b = boxes.get(t.id)!; return { w: b.x1 - b.x0, h: b.y1 - b.y0 }; })
    .filter(({ w, h }) => (matching || (w > mouthW * 0.07 && w < mouthW * 0.2)) && h > w * 0.9 && h < w * 2).map(({ h }) => h);
  // Capped at 1.45× the width: a rough "central" that ran into the lower teeth mustn't set the limit.
  const crownH = centralHeights.length
    ? Math.min(Math.max(Math.min(...centralHeights), centralW * 1.15), centralW * 1.45)
    : centralW * 1.3;
  const expectedH = (fdi: number | null) => crownH * (fdi ? HEIGHT[Math.min(4, (fdi % 10) - 1)] ?? 0.75 : 0.85);
  const polygonArea = (pts: Point[]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  let refined = 0, kept = 0;
  const reasons: Record<string, string> = {};
  const claimed = new Uint8Array(width * height);
  const results = new Map<string, ToothRegion>();
  // Most certain teeth first, so they claim their pixels before doubtful neighbours.
  const order = [...visible].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const t of order) {
    const b = boxes.get(t.id)!;
    const i = sorted.findIndex(s => s.id === t.id);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, ew = expectedW(t.fdi);
    const cx = (b.x0 + b.x1) / 2;
    const top = b.y0;
    const neighbours = [sorted[i - 1], sorted[i + 1]].filter(Boolean).map(n => { const nb = boxes.get(n.id)!; return [(nb.x0 + nb.x1) / 2, nb.y0 + Math.min(nb.y1 - nb.y0, crownH) * 0.4] as Point; });
    const plausible = bw <= ew * 1.5 && bw >= ew * 0.4 && bh <= crownH * 1.35;
    const roughArea = polygonArea(t.outline.map(toCrop));
    const below: Point = [cx, top + crownH * 1.45];
    const prompt: ToothPrompt = {
      box: plausible ? [Math.max(0, b.x0 - bw * 0.06), Math.max(0, top - crownH * 0.06), Math.min(width - 1, b.x1 + bw * 0.06), Math.min(height - 1, top + Math.min(bh, crownH * 1.15))] : null,
      positive: [[cx, top + Math.min(bh, crownH) * 0.4]],
      negative: [...neighbours, ...(inside && inside[Math.round(below[1]) * width + Math.round(below[0])] ? [below] : []), ...(lip ? [[cx, lipTop - 3] as Point] : [])],
    };
    const why: string[] = [];
    let best: { mask: Uint8Array; score: number } | null = null;
    for (const c of await segmentOne(rt, embeddings, prompt, scale, width, height)) {
      const mask = c.mask;
      // Never onto a neighbour already traced, or outside the tooth's own region when that looks right.
      for (let p = 0; p < mask.length; p++) if (claimed[p]) mask[p] = 0;
      if (plausible) {
        const bx0 = b.x0 - bw * 0.12, bx1 = b.x1 + bw * 0.12;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (x < bx0 || x > bx1) mask[y * width + x] = 0;
      }
      const eh = expectedH(t.fdi);
      cutAtWaist(mask, width, height, eh * 0.72, eh * 1.12);
      const part = largestComponent(mask, width, height);
      let n = 0, out = 0, sx0 = width, sx1 = 0, sy0 = height, sy1 = 0;
      for (let p = 0; p < part.length; p++) {
        if (!part[p]) continue;
        n++;
        if (inside && !inside[p]) out++;
        const x = p % width, y = (p - x) / width;
        if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
      }
      const w = sx1 - sx0, h = sy1 - sy0;
      const fail = n < ew * crownH * 0.2 ? "fragment"
        // A believable rough outline is never replaced by a much smaller one.
        : plausible && n < roughArea * 0.6 ? `shrunk ${(n / roughArea).toFixed(2)}`
          // Where the rough region is doubtful, a trace must still cover at least half of it and be confident.
          : !plausible && (n < roughArea * 0.5 || c.score < 0.85) ? `unsure ${(n / roughArea).toFixed(2)} s${c.score.toFixed(2)}`
        : out > n * 0.22 ? `lips ${(out / n).toFixed(2)}`
          : h > eh * 1.25 ? `tall ${(h / eh).toFixed(2)}`
            : w > ew * 1.6 ? `wide ${(w / ew).toFixed(2)}` : w < ew * 0.4 ? `narrow ${(w / ew).toFixed(2)}` : "";
      if (fail) { why.push(fail); continue; }
      if (!best || c.score > best.score) best = { mask: part, score: c.score };
    }
    if (!best) {
      // Only a refinement failure: the rough outline stays. It's flagged only if it doesn't look like one tooth.
      kept++;
      reasons[String(t.fdi ?? t.id)] = why.join("; ");
      results.set(t.id, { ...t, requiresReview: t.requiresReview || !plausible });
      continue;
    }
    const mask = best.mask;
    const contour = maskContour(mask, width, height);
    if (contour.length < 3) { kept++; results.set(t.id, { ...t, requiresReview: true }); continue; }
    for (let p = 0; p < mask.length; p++) if (mask[p]) claimed[p] = 1;
    const outline = contour.map(toNorm);
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    refined++;
    results.set(t.id, {
      ...t,
      outline,
      bbox: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
      centroid: { x: xs.reduce((a, v) => a + v, 0) / xs.length, y: ys.reduce((a, v) => a + v, 0) / ys.length },
      confidence: t.confidence === null ? null : Math.min(1, Math.max(t.confidence, 0.4 + best.score * 0.5)),
      requiresReview: t.requiresReview && best.score < 0.85,
    });
  }
  const teeth = map.teeth.map(t => results.get(t.id) ?? t);
  return { map: { ...map, teeth, method: "on-device-sam" }, stats: { refined, kept, ms: Date.now() - start, reasons } };
}
