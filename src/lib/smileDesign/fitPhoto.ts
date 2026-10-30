import type { Photo } from "../types";
import { releaseCanvas } from "../canvasMemory";
import { analyseSmile } from "../face/analysis";
import { INNER_LIP, pick, type Point } from "../face/geometry";
import { fillPolygon } from "../toothMap/segment";
import { rgbToLab, toothWeights } from "../whitening";
import { DIVISIONS, GUIDE_SAMPLES, mouthLine, placeTemplate, type SmileFrameFit, type SmileGuideShape } from "./frame";
import type { ToothMap } from "../toothMap/types";
import { measureSmile, openingFromTeeth, type SmileMeasurement } from "./measure";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be opened."));
    image.src = src;
  });
}

/** The image is read at most this wide. */
const MAX_WIDTH = 900;
/** The level mouth image's extent around the centre of the mouth line, in half mouth widths. */
const REACH_X = 1.15, ABOVE = 0.6, BELOW = 0.6;
/** Fewer boundaries seen than this and the measurement isn't trusted. */
const MIN_FOUND = 3;

type Fitted = { fit: SmileFrameFit; shape: SmileGuideShape; nasal?: [[Point, Point], [Point, Point]] };

/** Pixels of a canvas the image is drawn into by `draw`, released afterwards. */
function readPixels(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    draw(ctx);
    return ctx.getImageData(0, 0, w, h).data;
  } finally {
    releaseCanvas(canvas);
  }
}

/** A measurement (in a level image, `unit` pixels per half mouth width) as guide units around the dental midline and `row0`. */
function shapeFrom(measured: SmileMeasurement, unit: number, row0: number): SmileGuideShape {
  const m = measured.boundaries[3];
  const u = (x: number) => (x - m) / unit, v = (y: number) => (y - row0) / unit;
  const xs = Array.from({ length: GUIDE_SAMPLES }, (_, i) => m + (-1 + i * 0.05) * unit);
  return {
    gum: xs.map(x => v(measured.gumAt(x))),
    edge: xs.map(x => v(measured.edgeAt(x))),
    span: [Math.max(-1, Math.min(u(measured.span[0]), u(measured.boundaries[0]))), Math.min(1, Math.max(u(measured.span[1]), u(measured.boundaries[6])))],
    divisions: measured.boundaries.map(u),
    teeth: measured.teeth.map(([t, b]) => [v(t), v(b)]),
    measured: true,
  };
}

/**
 * Fits the smile guide to the patient's own teeth, on the device. The smile
 * analysis gives the mouth line and the facial midline; the mouth is then read
 * level, and the upper front teeth measured: the dental midline, each tooth's
 * boundaries, its top and its biting edge. When the teeth can't be read, the
 * template is placed from the lips instead. A close-up with no face is measured
 * from its teeth alone. In the photo's own pixels.
 */
export async function fitGuideToPhoto(photo: Pick<Photo, "dataUrl" | "width" | "height">, signal?: AbortSignal): Promise<Fitted | null> {
  const { detectFace } = await import("../face/landmarks");
  const found = await detectFace(photo.dataUrl, signal).catch(() => null);
  if (signal?.aborted) return null;
  const image = await load(photo.dataUrl);
  const nw = image.naturalWidth, nh = image.naturalHeight;
  if (!nw || !nh) return null;
  // Measured in the image's natural pixels; the guide is drawn in the photo's.
  const toPhoto = (fit: SmileFrameFit): SmileFrameFit => {
    const sx = photo.width / nw, sy = photo.height / nh;
    return { cx: fit.cx * sx, cy: fit.cy * sy, halfWidth: fit.halfWidth * sx, angle: Math.atan2(Math.sin(fit.angle) * sy, Math.cos(fit.angle) * sx) };
  };
  const line = found && found.length >= 468 ? mouthLine(found) : null;
  if (!found || !line) {
    // A close-up has no face to find: its teeth by colour, else the teeth the tooth map finds.
    const closeUp = fitCloseUp(image) ?? await fitFromToothMap(photo.dataUrl, nw, nh, signal);
    return closeUp ? { fit: toPhoto(closeUp.fit), shape: closeUp.shape } : null;
  }
  // Nasal width lines (smile analysis): through each nose wing's outer edge, parallel to the facial midline, nose to chin.
  const analysis = analyseSmile(found, nw, nh);
  const sx = photo.width / nw, sy = photo.height / nh;
  const nasal = analysis?.alae ? analysis.alae.map(([x, y]): [Point, Point] => {
    const [dx, dy] = analysis.midline.direction, reach = line.halfWidth;
    return [[(x - dx * reach * 0.4) * sx, (y - dy * reach * 0.4) * sy], [(x + dx * reach * 1.4) * sx, (y + dy * reach * 1.4) * sy]];
  }) as [[Point, Point], [Point, Point]] : undefined;
  const withNasal = (f: Fitted | null): Fitted | null => (f && nasal ? { ...f, nasal } : f);
  const template = () => { const t = placeTemplate(found); return withNasal(t ? { fit: toPhoto(t.fit), shape: t.shape } : null); };

  const { mid, angle, halfWidth: hw } = line;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const k = Math.max(1, (2 * REACH_X * hw) / MAX_WIDTH);
  const w = Math.round((2 * REACH_X * hw) / k), h = Math.round(((ABOVE + BELOW) * hw) / k);
  if (w < 40 || h < 20) return template();
  // Photo → level mouth image: rotate about the mouth centre, then offset and scale.
  const level = ([x, y]: Point): Point => [((x - mid[0]) * cos + (y - mid[1]) * sin + REACH_X * hw) / k, (-(x - mid[0]) * sin + (y - mid[1]) * cos + ABOVE * hw) / k];
  const row0 = (ABOVE * hw) / k;

  // The facial midline (smile analysis: through the glabella, square to the eyes) where it crosses the mouth line.
  let midlineX = level(mid)[0];
  if (analysis) {
    const { through, direction } = analysis.midline;
    const a = level(through), b = level([through[0] + direction[0] * 100, through[1] + direction[1] * 100]);
    if (Math.abs(b[1] - a[1]) > 1e-6) midlineX = a[0] + ((row0 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
  }

  const rgba = readPixels(w, h, ctx => {
    ctx.setTransform(cos / k, -sin / k, sin / k, cos / k, (-cos * mid[0] - sin * mid[1] + REACH_X * hw) / k, (sin * mid[0] - cos * mid[1] + ABOVE * hw) / k);
    ctx.drawImage(image, 0, 0);
  });
  if (!rgba) return template();
  const measured = measureSmile(rgba, w, h, fillPolygon(pick(found, INNER_LIP).map(level), w, h), hw / k, midlineX);
  if (!measured || measured.found < MIN_FOUND) return template();
  // The origin moves along the mouth line to the dental midline.
  const along = measured.boundaries[3] * k - REACH_X * hw;
  return withNasal({ fit: toPhoto({ cx: mid[0] + along * cos, cy: mid[1] + along * sin, halfWidth: hw, angle }), shape: shapeFrom(measured, hw / k, row0) });
}

/** A close-up smile: the teeth are found by colour, the mouth assumed level, its width from the visible teeth. */
function fitCloseUp(image: HTMLImageElement): Fitted | null {
  const nw = image.naturalWidth, nh = image.naturalHeight;
  const k = Math.max(1, nw / MAX_WIDTH), w = Math.round(nw / k), h = Math.round(nh / k);
  const rgba = readPixels(w, h, ctx => ctx.drawImage(image, 0, 0, w, h));
  if (!rgba) return null;
  // Lips and gums: clearly red.
  const red = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const [l, a] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); red[i] = l > 20 && a > 14 ? 1 : 0; }
  const teeth = openingFromTeeth(toothWeights(rgba, w, h, new Uint8Array(w * h).fill(1)).weights, red, w, h);
  if (!teeth) return null;
  // The visible teeth span a little less than the mouth.
  const hw = ((teeth.x1 - teeth.x0) / 2) * 1.1, row0 = (teeth.y0 + teeth.y1) / 2;
  const measured = measureSmile(rgba, w, h, teeth.opening, hw, (teeth.x0 + teeth.x1) / 2);
  if (!measured || measured.found < MIN_FOUND) return null;
  return { fit: { cx: measured.boundaries[3] * k, cy: row0 * k, halfWidth: hw * k, angle: 0 }, shape: shapeFrom(measured, hw, row0) };
}

/** The tooth map's teeth (found on the device, as for the suggested edit area) as a guide, in natural image pixels. */
async function fitFromToothMap(dataUrl: string, nw: number, nh: number, signal?: AbortSignal): Promise<Fitted | null> {
  const { detectToothMap } = await import("../toothMap/detect");
  const map = await detectToothMap({ dataUrl }, "Close-up", undefined, { refine: false, signal }).catch(() => null);
  return map && !signal?.aborted ? guideFromToothMap(map, nw, nh) : null;
}

type Box = { x0: number; x1: number; top: number; bottom: number; cx: number; fdi: number | null };
const FRONT = [13, 12, 11, 21, 22, 23];

/**
 * A smile guide from a tooth map: the two central incisors (by number, else the widest neighbouring pair near the
 * middle) and up to two teeth either side give the seven boundaries and each tooth's top and edge. Missing laterals
 * or canines are filled from the guide's proportions (1 : 0.71 : 0.54). The mouth is taken as level (the camera
 * guides that), and its half-width from the canines, as the template places them. Null with fewer than two teeth.
 */
export function guideFromToothMap(map: Pick<ToothMap, "teeth">, nw: number, nh: number): Fitted | null {
  const boxes: Box[] = map.teeth.filter(t => t.visible !== false && t.outline.length >= 3).map(t => {
    const xs = t.outline.map(p => p[0] * nw), ys = t.outline.map(p => p[1] * nh);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    return { x0, x1, top: Math.min(...ys), bottom: Math.max(...ys), cx: (x0 + x1) / 2, fdi: t.fdi };
  }).filter(b => b.x1 - b.x0 > 2 && b.bottom - b.top > 2).sort((a, b) => a.cx - b.cx);
  if (boxes.length < 2) return null;
  // The centrals: numbered 11 and 21 if the map says so, else the widest neighbouring pair in the middle half.
  let left = boxes.findIndex((b, i) => i + 1 < boxes.length && FRONT.slice(2, 4).includes(b.fdi ?? -1) && FRONT.slice(2, 4).includes(boxes[i + 1].fdi ?? -1));
  if (left < 0) {
    const lo = Math.min(...boxes.map(b => b.x0)), hi = Math.max(...boxes.map(b => b.x1)), mid = (lo + hi) / 2;
    let best = -1;
    boxes.forEach((b, i) => {
      if (i + 1 >= boxes.length) return;
      const pair = (b.x1 - b.x0) + (boxes[i + 1].x1 - boxes[i + 1].x0), centre = (b.x1 + boxes[i + 1].x0) / 2;
      const score = pair - Math.abs(centre - mid) * 0.8;
      if (best < 0 || score > best) { best = score; left = i; }
    });
  }
  if (left < 0) return null;
  const slot = (k: number): Box | null => boxes[left + k - 2] ?? null; // slots 0..5: 13 12 11 | 21 22 23
  const L = slot(2)!, R = slot(3)!;
  const w = (b: Box) => b.x1 - b.x0;
  let found = 0;
  const join = (a: Box | null, b: Box | null, fallback: number) => { if (a && b) { found++; return (a.x1 + b.x0) / 2; } return fallback; };
  const b3 = join(L, R, (L.x1 + R.x0) / 2);
  const centralW = (w(L) + w(R)) / 2;
  const lateralW = centralW * (DIVISIONS[2] - DIVISIONS[1]) / DIVISIONS[1];
  const canineW = centralW * (DIVISIONS[3] - DIVISIONS[2]) / DIVISIONS[1];
  const b2 = join(slot(1), L, L.x0), b4 = join(R, slot(4), R.x1);
  const b1 = slot(1) ? join(slot(0), slot(1), slot(1)!.x0) : b2 - lateralW;
  const b5 = slot(4) ? join(slot(4), slot(5), slot(4)!.x1) : b4 + lateralW;
  const b0 = slot(0) ? (found++, slot(0)!.x0) : b1 - canineW;
  const b6 = slot(5) ? (found++, slot(5)!.x1) : b5 + canineW;
  const boundaries = [b0, b1, b2, b3, b4, b5, b6];
  if (!boundaries.every((v, i) => i === 0 || v > boundaries[i - 1])) return null;
  const hw = Math.max(b3 - b0, b6 - b3) / DIVISIONS[3];
  // Each tooth's top and edge, a missing one taken from its neighbour towards the middle.
  const rows: [number, number][] = [0, 1, 2, 3, 4, 5].map(k => {
    const b = slot(k) ?? (k < 3 ? (slot(k + 1) ?? slot(2)) : (slot(k - 1) ?? slot(3)))!;
    return [b.top, b.bottom];
  });
  const centres = [0, 1, 2, 3, 4, 5].map(k => (boundaries[k] + boundaries[k + 1]) / 2);
  const through = (values: number[]) => (x: number) => {
    if (x <= centres[0]) return values[0];
    for (let i = 1; i < centres.length; i++) if (x <= centres[i]) { const t = (x - centres[i - 1]) / (centres[i] - centres[i - 1]); return values[i - 1] + (values[i] - values[i - 1]) * t; }
    return values[values.length - 1];
  };
  const tops = rows.map(r => r[0]), edges = rows.map(r => r[1]);
  // The guide's row 0 sits a little above the gum line, where the template puts the lip line.
  const row0 = Math.min(rows[2][0], rows[3][0]) - 0.1 * hw;
  const measured: SmileMeasurement = {
    span: [Math.min(...boxes.map(b => b.x0)), Math.max(...boxes.map(b => b.x1))],
    gumAt: through(tops), edgeAt: through(edges), boundaries, teeth: rows, found,
  };
  return { fit: { cx: b3, cy: row0, halfWidth: hw, angle: 0 }, shape: shapeFrom(measured, hw, row0) };
}
