import type { Point } from "../face/geometry";
import type { ToothShape } from "../types";
import { DESIGN_SHAPES, type DesignShape, type DesignTooth } from "./shapes";

/*
 * The smile design frame, measured from the owner's overlay (smile shapes/overlay.png).
 * Units: x in half mouth widths from the midline (0 at the midline, 1 at the corner
 * of the mouth); y in the same unit, downwards. Curves are sampled every 0.05 of x
 * and averaged across both sides, so the frame is symmetric.
 */
const STEP = 0.05;
/** The gum line (blue): nearly flat across the front teeth, rising into the corners. */
export const GUM_CURVE = [0.1102, 0.1097, 0.1094, 0.1075, 0.1078, 0.1059, 0.1041, 0.1017, 0.0993, 0.096, 0.0918, 0.0883, 0.0837, 0.0781, 0.072, 0.0645, 0.0554, 0.0449, 0.0329, 0.0193, 0.0091];
/** The biting-edge curve (orange): follows the lower lip, lowest at the midline. */
export const EDGE_CURVE = [0.4291, 0.4286, 0.4267, 0.4238, 0.4187, 0.4125, 0.4045, 0.3951, 0.3842, 0.3719, 0.3585, 0.3438, 0.3245, 0.3028, 0.2766, 0.2451, 0.2097, 0.1688, 0.1239, 0.0754, 0.0235];
/** Tooth divisions (green): midline | central | lateral | canine, in the same unit. Widths 1 : 0.71 : 0.54. */
export const DIVISIONS = [0, 0.2397, 0.4088, 0.5372] as const;
/** Image left to right: patient's right canine (13) to left canine (23). */
const KINDS: DesignTooth[] = ["canine", "lateral", "central", "central", "lateral", "canine"];
const FDI = [13, 12, 11, 21, 22, 23];
export const GUIDE_SAMPLES = 41;

/** Which drawn style each tooth form uses. */
export const SHAPE_STYLE: Record<ToothShape, DesignShape> = { Rounded: "oval", Square: "square", Rectangular: "rectangle", Triangular: "triangle" };

/**
 * Where the guide sits on the photograph, in photo pixels: its origin (on the
 * dental midline, at the line between the corners of the mouth), half the mouth's
 * width (the unit for both axes) and the roll of the mouth line.
 */
export interface SmileFrameFit { cx: number; cy: number; halfWidth: number; angle: number }

/** The patient's smile in guide units (see SmileFrameFit): measured from the photo, or the template. */
export interface SmileGuideShape {
  /** Gum line and biting-edge curve: y at x = −1…1 in steps of 0.05 (41 samples). */
  gum: number[];
  edge: number[];
  /** How far across the curves are drawn: the visible teeth, or corner to corner for the template. */
  span: [number, number];
  /** Tooth boundaries, image left to right (7): canine | lateral | central | midline (0) | central | lateral | canine. */
  divisions: number[];
  /** Each tooth's top and biting edge at its centre, image left to right (13, 12, 11, 21, 22, 23). */
  teeth: [number, number][];
  /** True when measured from this photo's teeth; false when the template was placed from the lips. */
  measured: boolean;
}

/** The fitted guide plus the clinician's adjustments. Saved with the photo, on the device. */
export interface SmileGuide {
  version: 2;
  visible: boolean;
  fit: SmileFrameFit;
  shape: SmileGuideShape;
  /** Multipliers on the fitted width and tooth length; curve 0 is flat, 1 as fitted. */
  width: number;
  length: number;
  curve: number;
  /** Nudges, in half mouth widths. */
  dx: number;
  dy: number;
  /** Nasal width lines through the outer edges of the nose, in photo pixels: facial references that stay put. */
  nasal?: [[Point, Point], [Point, Point]];
}

export interface GuideGeometry {
  gum: Point[];
  edge: Point[];
  midline: [Point, Point];
  divisions: [Point, Point][];
  teeth: { fdi: number; kind: DesignTooth; outline: Point[] }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sample(table: readonly number[], u: number): number {
  const p = clamp(Math.abs(u), 0, 1) / STEP;
  const i = Math.min(table.length - 2, Math.floor(p));
  return table[i] + (table[i + 1] - table[i]) * (p - i);
}

/** A curve stored at x = −1…1 (41 samples), read anywhere across it. */
export function curveAt(curve: readonly number[], u: number): number {
  const p = (clamp(u, -1, 1) + 1) / STEP;
  const i = Math.min(GUIDE_SAMPLES - 2, Math.floor(p));
  return curve[i] + (curve[i + 1] - curve[i]) * (p - i);
}

/** The owner's template as a guide shape: `sy` is its height scale over its width scale, `lift` moves it down. */
export function templateShape(sy: number, lift = 0): SmileGuideShape {
  const g0 = GUM_CURVE[0];
  const xs = Array.from({ length: GUIDE_SAMPLES }, (_, i) => -1 + i * STEP);
  const y = (table: readonly number[], u: number) => (sample(table, u) - g0) * sy + lift;
  const divisions = [-DIVISIONS[3], -DIVISIONS[2], -DIVISIONS[1], 0, DIVISIONS[1], DIVISIONS[2], DIVISIONS[3]];
  const teeth = KINDS.map((_, k): [number, number] => {
    const uc = (divisions[k] + divisions[k + 1]) / 2;
    return [y(GUM_CURVE, uc), y(EDGE_CURVE, uc)];
  });
  return { gum: xs.map(u => y(GUM_CURVE, u)), edge: xs.map(u => y(EDGE_CURVE, u)), span: [-1, 1], divisions, teeth, measured: false };
}

export function newGuide(fit: SmileFrameFit, shape: SmileGuideShape): SmileGuide {
  return { version: 2, visible: true, fit, shape, width: 1, length: 1, curve: 1, dx: 0, dy: 0 };
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const numbers = (v: unknown, length: number): v is number[] => Array.isArray(v) && v.length === length && v.every(finite);

function validShape(s: Partial<SmileGuideShape> | undefined): s is SmileGuideShape {
  return Boolean(s) && numbers(s!.gum, GUIDE_SAMPLES) && numbers(s!.edge, GUIDE_SAMPLES) && numbers(s!.span, 2) && s!.span![0] < s!.span![1]
    && numbers(s!.divisions, 7) && s!.divisions!.every((d, i, a) => i === 0 || d > a[i - 1])
    && Array.isArray(s!.teeth) && s!.teeth.length === 6 && s!.teeth.every(t => numbers(t, 2) && t[0] < t[1]);
}

/** Saved data in, a valid guide (or nothing) out. */
export function normaliseGuide(value: unknown): SmileGuide | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<SmileGuide>;
  const f = v.fit as Partial<SmileFrameFit> | undefined;
  if (v.version !== 2 || !f || ![f.cx, f.cy, f.halfWidth, f.angle].every(finite) || !(f.halfWidth! > 0) || !validShape(v.shape)) return undefined;
  const s = v.shape;
  const point = (p: unknown): p is Point => numbers(p, 2);
  const nasal = Array.isArray(v.nasal) && v.nasal.length === 2 && v.nasal.every(l => Array.isArray(l) && l.length === 2 && l.every(point))
    ? v.nasal.map(l => [[l[0][0], l[0][1]], [l[1][0], l[1][1]]]) as [[Point, Point], [Point, Point]] : undefined;
  return {
    version: 2, visible: v.visible !== false,
    fit: { cx: f.cx!, cy: f.cy!, halfWidth: f.halfWidth!, angle: f.angle! },
    shape: { gum: [...s.gum], edge: [...s.edge], span: [s.span[0], s.span[1]], divisions: [...s.divisions], teeth: s.teeth.map(t => [t[0], t[1]] as [number, number]), measured: s.measured === true },
    width: clamp(finite(v.width) ? v.width : 1, 0.7, 1.3), length: clamp(finite(v.length) ? v.length : 1, 0.7, 1.35),
    curve: clamp(finite(v.curve) ? v.curve : 1, 0, 1.8), dx: clamp(finite(v.dx) ? v.dx : 0, -0.5, 0.5), dy: clamp(finite(v.dy) ? v.dy : 0, -0.5, 0.5),
    ...(nasal ? { nasal } : {}),
  };
}

/**
 * The guide with the clinician's adjustments applied: where a point in guide
 * units (x already widened) lands in the photo, and back, plus each tooth's
 * boundaries and its top and edge lines.
 */
export function guideFrame(d: SmileGuide) {
  const { fit, shape: s } = d;
  const hw = fit.halfWidth;
  const g0 = curveAt(s.gum, 0), e0 = curveAt(s.edge, 0);
  // Curve flattens or deepens each line about its midline height; length scales down from the gum.
  const bend = (y: number, y0: number) => y0 + (y - y0) * d.curve;
  // Curves are stored for unwidened x; `u` here is widened.
  const gum = (u: number) => bend(curveAt(s.gum, u / d.width), g0);
  const edge = (u: number) => { const top = gum(u); return top + (bend(curveAt(s.edge, u / d.width), e0) - top) * d.length; };
  const cos = Math.cos(fit.angle), sin = Math.sin(fit.angle);
  const ox = fit.cx + d.dx * hw, oy = fit.cy + d.dy * hw;
  const toPhoto = (u: number, y: number): Point => {
    const lx = u * hw, ly = y * hw;
    return [ox + lx * cos - ly * sin, oy + lx * sin + ly * cos];
  };
  const toGuide = (x: number, y: number): Point => {
    const lx = x - ox, ly = y - oy;
    return [(lx * cos + ly * sin) / hw, (-lx * sin + ly * cos) / hw];
  };
  const divisions = s.divisions.map(u => u * d.width);
  // Each tooth's top and edge: its own measured heights, carried along the gum line and edge curve.
  const teeth = s.teeth.map(([top, bottom], k) => {
    const uc = (divisions[k] + divisions[k + 1]) / 2;
    const t = bend(top, g0), b = t + (bend(bottom, e0) - t) * d.length;
    const dt = t - gum(uc), db = b - edge(uc);
    return { top: (u: number) => gum(u) + dt, bottom: (u: number) => edge(u) + db, centreTop: t, centreBottom: b };
  });
  // Photo pixels per guide unit.
  return { toPhoto, toGuide, gum, edge, divisions, teeth, scale: hw, span: [s.span[0] * d.width, s.span[1] * d.width] as [number, number] };
}

/**
 * The guide in photo pixels. Each tooth is the chosen form's outline warped into
 * that tooth's own box (between its boundaries, from its top to its biting edge),
 * bent to follow the gum line and edge curve.
 */
export function guideGeometry(d: SmileGuide, style: DesignShape): GuideGeometry {
  const f = guideFrame(d), at = f.toPhoto;
  const teeth = KINDS.map((kind, k) => {
    const a = f.divisions[k], b = f.divisions[k + 1], line = f.teeth[k];
    // The outline's x = 0 is the side nearer the midline.
    const outline = DESIGN_SHAPES[style][kind].map(([sx, ty]) => {
      const u = k < 3 ? b - sx * (b - a) : a + sx * (b - a);
      const top = line.top(u);
      return at(u, top + ty * (line.bottom(u) - top));
    });
    return { fdi: FDI[k], kind, outline };
  });
  const across = Array.from({ length: GUIDE_SAMPLES }, (_, i) => f.span[0] + (i / (GUIDE_SAMPLES - 1)) * (f.span[1] - f.span[0]));
  const lines = f.teeth;
  const centreTop = Math.min(lines[2].top(0), lines[3].top(0)), centreEdge = Math.max(lines[2].bottom(0), lines[3].bottom(0));
  const reach = (centreEdge - centreTop) * 0.35;
  return {
    gum: across.map(u => at(u, f.gum(u))),
    edge: across.map(u => at(u, f.edge(u))),
    midline: [at(0, centreTop - reach), at(0, centreEdge + reach)],
    divisions: [0, 1, 2, 4, 5, 6].map(i => {
      const u = f.divisions[i], near = [lines[i - 1], lines[i]].filter(Boolean);
      return [at(u, Math.min(...near.map(l => l.top(u)))), at(u, Math.max(...near.map(l => l.bottom(u))))] as [Point, Point];
    }),
    teeth,
  };
}

/** Upper front teeth in guide order, image left to right. */
export const GUIDE_TEETH = FDI;

/** The mouth line from the face landmarks: its centre, roll and half width (photo pixels). */
export function mouthLine(points: readonly Point[]): { mid: Point; angle: number; halfWidth: number } | null {
  if (points.length < 468) return null;
  const left = points[61], right = points[291];
  const halfWidth = Math.hypot(right[0] - left[0], right[1] - left[1]) / 2;
  if (!(halfWidth > 4)) return null;
  return { mid: [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2], angle: Math.atan2(right[1] - left[1], right[0] - left[0]), halfWidth };
}

/**
 * Place the template from the face alone, for when the teeth can't be measured:
 * the corners of the mouth set its width and roll, the facial midline its centre
 * and the lips its height.
 */
export function placeTemplate(points: readonly Point[]): { fit: SmileFrameFit; shape: SmileGuideShape } | null {
  const line = mouthLine(points);
  if (!line) return null;
  const { mid, angle, halfWidth } = line;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const local = ([x, y]: Point) => [(x - mid[0]) * cos + (y - mid[1]) * sin, -(x - mid[0]) * sin + (y - mid[1]) * cos];
  const midline = [points[168], points[1], points[0], points[17]].map(local).reduce((s, p) => s + p[0], 0) / 4;
  const upperLip = local(points[13])[1], lowerLip = local(points[14])[1];
  const opening = Math.max(1, lowerLip - upperLip);
  const gum = upperLip + opening * 0.04, edge = upperLip + opening * 0.8;
  if (!(edge - gum > 2)) return null;
  const shape = templateShape((edge - gum) / halfWidth / (EDGE_CURVE[0] - GUM_CURVE[0]), gum / halfWidth);
  return { fit: { cx: mid[0] + midline * cos, cy: mid[1] + midline * sin, halfWidth, angle }, shape };
}

/** An SVG path through points, smoothed (Catmull-Rom); closed for outlines. */
export function smoothPath(points: readonly Point[], closed: boolean): string {
  if (points.length < 2) return "";
  const n = points.length;
  const p = (i: number) => points[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}
