import type { ToothMap } from "./types";

/*
 * Display geometry for the tooth map overlay.
 *
 * Two outlines exist for every tooth and must stay separate:
 *   - the GENERATION outline (ToothRegion.outline): the raw segmentation,
 *     used for every mask, the protected composite and verification;
 *   - the DISPLAY outline built here: simplified, smoothed and fitted to a
 *     curve so the overlay reads like a design drawing, not a detection.
 * Nothing here is ever used to build a mask.
 */

export type Point = [number, number];

/** One tooth as the overlay draws it (photo pixels). */
export interface ToothShape {
  id: string;
  fdi: number | null;
  centroid: Point;
  width: number;
  height: number;
  /** Long-axis tilt from vertical, in radians (positive leans to image right at the incisal edge). */
  axis: number;
  /** The smoothed crown contour, as an SVG path. */
  path: string;
  /** Lowest point of the crown in the photo: the incisal edge's centre. */
  incisal: Point;
  /** Leftmost and rightmost extent in the photo (for contacts). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Neighbours towards the midline (mesial) and away from it (distal). */
  mesial: string | null;
  distal: string | null;
  confidence: number | null;
  requiresReview: boolean;
  selected: boolean;
}

export interface VerticalGuide { x: number; y0: number; y1: number }

export interface SmileGuides {
  /** Smooth curve through the incisal edges, extended a little past the last teeth. */
  arc: string | null;
  /** Dental midline between the central incisors. */
  midline: VerticalGuide | null;
  /** Contacts between neighbouring teeth: the proportion guides. */
  verticals: VerticalGuide[];
}

function movingAverage(points: Point[]): Point[] {
  const n = points.length;
  return points.map((_, i) => {
    const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n];
    return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4] as Point;
  });
}

/** Monotone-chain convex hull, anticlockwise in image coordinates. */
export function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Evenly spaced points around a closed contour. */
export function resampleClosed(points: Point[], count: number): Point[] {
  const n = points.length;
  if (n < 3) return points;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return points;
  const out: Point[] = [];
  let seg = 0, into = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (into + lengths[seg] < target && seg < n - 1) { into += lengths[seg]; seg++; }
    const t = lengths[seg] ? (target - into) / lengths[seg] : 0;
    const a = points[seg], b = points[(seg + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * Raw segmentation → a deliberate crown contour: smooth away pixel noise,
 * take the crown's convex envelope (frontal crowns are convex; notches in a
 * mask are almost always noise), then space the points evenly for the curve.
 */
export function smoothContour(points: Point[], samples = 28): Point[] {
  if (points.length < 3) return points;
  // Even spacing first, so smoothing never pulls sparse corners inwards.
  const hull = convexHull(movingAverage(resampleClosed(points, 64)));
  return hull.length < 3 ? hull : resampleClosed(hull, samples);
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A closed Catmull-Rom spline through the points, as cubic Béziers. */
export function closedCurvePath(points: Point[]): string {
  const n = points.length;
  if (n < 3) return "";
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d} Z`;
}

/** An open Catmull-Rom spline through the points. */
export function openCurvePath(points: Point[]): string {
  const n = points.length;
  if (n < 2) return "";
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** Long-axis tilt from the contour's second moments. */
function axisTilt(points: Point[], cx: number, cy: number): number {
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  // Angle of the major axis from the x-axis; the crown's long axis is the near-vertical one.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const fromVertical = theta - Math.sign(theta || 1) * Math.PI / 2;
  return Math.abs(fromVertical) > Math.PI / 4 ? 0 : -fromVertical;
}

/** The dental midline's x, between the central incisors' facing edges. */
function midlineX(shapes: ToothShape[]): number | null {
  const r = shapes.find(s => s.fdi === 11), l = shapes.find(s => s.fdi === 21);
  if (r && l) return (Math.min(r.right, l.left) + Math.max(r.right, l.left)) / 2;
  return null;
}

/** Structured display geometry for every visible tooth. */
export function toothShapes(map: ToothMap | null, width: number, height: number, selectedTeeth: number[]): ToothShape[] {
  if (!map) return [];
  const selected = new Set(selectedTeeth);
  const shapes: ToothShape[] = map.teeth.filter(t => t.visible && t.outline.length >= 3).map(t => {
    const raw = t.outline.map(([x, y]) => [x * width, y * height] as Point);
    const contour = smoothContour(raw);
    const xs = contour.map(p => p[0]), ys = contour.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const cx = contour.reduce((s, p) => s + p[0], 0) / contour.length, cy = contour.reduce((s, p) => s + p[1], 0) / contour.length;
    // The incisal edge's centre: the lowest points of the crown, averaged.
    const low = [...contour].sort((a, b) => b[1] - a[1]).slice(0, Math.max(2, Math.round(contour.length / 7)));
    const incisal: Point = [low.reduce((s, p) => s + p[0], 0) / low.length, low.reduce((s, p) => s + p[1], 0) / low.length];
    return {
      id: t.id, fdi: t.fdi, centroid: [cx, cy], width: right - left, height: bottom - top, axis: axisTilt(contour, cx, cy),
      path: closedCurvePath(contour), incisal, left, right, top, bottom, mesial: null, distal: null,
      confidence: t.confidence, requiresReview: t.requiresReview && !map.confirmedByClinician,
      selected: t.fdi !== null && selected.has(t.fdi),
    };
  });
  const sorted = [...shapes].sort((a, b) => a.centroid[0] - b.centroid[0]);
  const mid = midlineX(shapes) ?? (sorted.length ? (sorted[0].left + sorted[sorted.length - 1].right) / 2 : 0);
  sorted.forEach((s, i) => {
    const before = sorted[i - 1] ?? null, after = sorted[i + 1] ?? null;
    const towardsMid = s.centroid[0] < mid ? after : before;
    const away = s.centroid[0] < mid ? before : after;
    s.mesial = towardsMid?.id ?? null;
    s.distal = away?.id ?? null;
  });
  return shapes;
}

/** Least-squares parabola y = a·u² + b·u + c with u = x − m. */
function fitParabola(points: Point[]): ((x: number) => number) | null {
  if (points.length < 3) return null;
  const m = points.reduce((s, p) => s + p[0], 0) / points.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const [x, y] of points) {
    const u = x - m;
    s0 += 1; s1 += u; s2 += u * u; s3 += u ** 3; s4 += u ** 4;
    t0 += y; t1 += u * y; t2 += u * u * y;
  }
  // Solve the 3×3 normal equations (Cramer's rule).
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const A = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
  const D = det(A);
  if (Math.abs(D) < 1e-9) return null;
  const a = det([[t2, s3, s2], [t1, s2, s1], [t0, s1, s0]]) / D;
  const b = det([[s4, t2, s2], [s3, t1, s1], [s2, t0, s0]]) / D;
  const c = det([[s4, s3, t2], [s3, s2, t1], [s2, s1, t0]]) / D;
  return (x: number) => a * (x - m) ** 2 + b * (x - m) + c;
}

/** Smile arc, dental midline and contact guides from the display geometry. */
export function smileGuides(shapes: ToothShape[]): SmileGuides {
  if (!shapes.length) return { arc: null, midline: null, verticals: [] };
  const sorted = [...shapes].sort((a, b) => a.centroid[0] - b.centroid[0]);
  const top = Math.min(...shapes.map(s => s.top)), bottom = Math.max(...shapes.map(s => s.bottom));
  const h = bottom - top;
  const fit = fitParabola(shapes.map(s => s.incisal));
  let arc: string | null = null;
  if (fit && sorted.length >= 3) {
    const x0 = sorted[0].left, x1 = sorted[sorted.length - 1].right;
    const extend = (x1 - x0) * 0.14;
    const points: Point[] = Array.from({ length: 25 }, (_, i) => {
      const x = x0 - extend + ((x1 - x0 + 2 * extend) * i) / 24;
      return [x, fit(x)];
    });
    // An arc that runs far outside the teeth means the fit is unreliable: leave it out.
    if (points.every(([, y]) => y > top - h && y < bottom + h * 1.5)) arc = openCurvePath(points);
  }
  const mx = midlineX(shapes);
  const midline = mx === null ? null : { x: mx, y0: top - h * 0.9, y1: bottom + h * 0.9 };
  const verticals: VerticalGuide[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const x = (a.right + b.left) / 2;
    if (mx !== null && Math.abs(x - mx) < 1) continue;
    verticals.push({ x, y0: top - h * 0.35, y1: bottom + h * 0.35 });
  }
  return { arc, midline, verticals };
}
