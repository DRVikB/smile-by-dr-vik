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
const KINDS: DesignTooth[] = ["central", "lateral", "canine"];

/** Which drawn style each tooth form uses. */
export const SHAPE_STYLE: Record<ToothShape, DesignShape> = { Rounded: "oval", Square: "square", Rectangular: "rectangle", Triangular: "triangle" };

/**
 * Where the frame sits on the photograph, in photo pixels: the midline point on the
 * gum line, the size of one unit across (half the mouth's width) and down, and the
 * roll of the line between the corners of the mouth.
 */
export interface SmileFrameFit { cx: number; cy: number; halfWidth: number; scaleY: number; angle: number }

/** The clinician's design: the fitted frame plus their adjustments. Saved with the case. */
export interface SmileDesign {
  version: 1;
  visible: boolean;
  fit: SmileFrameFit;
  /** Multipliers on the fitted width and tooth length; curve 0 is flat, 1 as fitted. */
  width: number;
  length: number;
  curve: number;
  /** Nudges, in half mouth widths. */
  dx: number;
  dy: number;
}

export interface DesignGeometry {
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

export function newDesign(fit: SmileFrameFit): SmileDesign {
  return { version: 1, visible: true, fit, width: 1, length: 1, curve: 1, dx: 0, dy: 0 };
}

/** Saved or synced data in, a valid design (or nothing) out. */
export function normaliseDesign(value: unknown): SmileDesign | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<SmileDesign>;
  const f = v.fit as Partial<SmileFrameFit> | undefined;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (v.version !== 1 || !f || ![f.cx, f.cy, f.halfWidth, f.scaleY, f.angle].every(finite) || !(f.halfWidth! > 0) || !(f.scaleY! > 0)) return undefined;
  return {
    version: 1, visible: v.visible !== false, fit: f as SmileFrameFit,
    width: clamp(finite(v.width) ? v.width : 1, 0.7, 1.3), length: clamp(finite(v.length) ? v.length : 1, 0.7, 1.35),
    curve: clamp(finite(v.curve) ? v.curve : 1, 0, 1.8), dx: clamp(finite(v.dx) ? v.dx : 0, -0.5, 0.5), dy: clamp(finite(v.dy) ? v.dy : 0, -0.5, 0.5),
  };
}

/** The frame, guides and tooth outlines in photo pixels. */
export function designGeometry(d: SmileDesign, shape: DesignShape): DesignGeometry {
  const { fit } = d;
  const hw = fit.halfWidth * d.width, sy = fit.scaleY * d.length;
  const g0 = GUM_CURVE[0], e0 = EDGE_CURVE[0];
  const gum = (u: number) => g0 + (sample(GUM_CURVE, u) - g0) * d.curve;
  const edge = (u: number) => e0 + (sample(EDGE_CURVE, u) - e0) * d.curve;
  const cos = Math.cos(fit.angle), sin = Math.sin(fit.angle);
  const ox = fit.cx + d.dx * fit.halfWidth, oy = fit.cy + d.dy * fit.halfWidth;
  const at = (u: number, y: number): Point => {
    const lx = u * hw, ly = (y - g0) * sy;
    return [ox + lx * cos - ly * sin, oy + lx * sin + ly * cos];
  };
  const across = Array.from({ length: 41 }, (_, i) => -1 + i * STEP);
  const teeth: DesignGeometry["teeth"] = [];
  for (const side of [-1, 1] as const) {
    KINDS.forEach((kind, i) => {
      const a = DIVISIONS[i], b = DIVISIONS[i + 1];
      const outline = DESIGN_SHAPES[shape][kind].map(([s, t]) => {
        const u = side * (a + s * (b - a));
        return at(u, gum(u) + t * (edge(u) - gum(u)));
      });
      // Patient's right (image left) is quadrant 1.
      teeth.push({ fdi: (side < 0 ? 10 : 20) + i + 1, kind, outline });
    });
  }
  return {
    gum: across.map(u => at(u, gum(u))),
    edge: across.map(u => at(u, edge(u))),
    midline: [at(0, g0 - (e0 - g0) * 0.35), at(0, e0 + (e0 - g0) * 0.35)],
    divisions: DIVISIONS.slice(1).flatMap(u => [-u, u].map(x => [at(x, gum(x)), at(x, edge(x))] as [Point, Point])),
    teeth,
  };
}

/**
 * Place the frame from the face: the corners of the mouth set its width and roll,
 * the facial midline its centre, and the upper teeth (when measured) or the lips
 * its height. `teeth` are the measured gum and edge heights of the upper front teeth.
 */
export function fitFrame(points: readonly Point[], teeth?: { gum: number; edge: number } | null): SmileFrameFit | null {
  if (points.length < 468) return null;
  const left = points[61], right = points[291];
  const angle = Math.atan2(right[1] - left[1], right[0] - left[0]);
  const halfWidth = Math.hypot(right[0] - left[0], right[1] - left[1]) / 2;
  if (!(halfWidth > 4)) return null;
  const mid: Point = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Coordinates along the mouth line (a) and across it (b), from its midpoint.
  const local = ([x, y]: Point) => [(x - mid[0]) * cos + (y - mid[1]) * sin, -(x - mid[0]) * sin + (y - mid[1]) * cos];
  const midline = [points[168], points[1], points[0], points[17]].map(local).reduce((s, p) => s + p[0], 0) / 4;
  const upperLip = local(points[13])[1], lowerLip = local(points[14])[1];
  const opening = Math.max(1, lowerLip - upperLip);
  const toLocal = (y: number) => local([mid[0] + midline * cos, y])[1];
  const gum = teeth ? toLocal(teeth.gum) : upperLip + opening * 0.04;
  const edge = teeth ? toLocal(teeth.edge) : upperLip + opening * 0.8;
  if (!(edge - gum > 2)) return null;
  const scaleY = (edge - gum) / (EDGE_CURVE[0] - GUM_CURVE[0]);
  return { cx: mid[0] + midline * cos - gum * sin, cy: mid[1] + midline * sin + gum * cos, halfWidth, scaleY, angle };
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
