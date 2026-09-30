import type { SmileAnalysis } from "./analysis";
import type { Point } from "./geometry";

/**
 * The smile analysis as lines on one photograph: eye line, facial midline,
 * mouth-corner line and smile arc, in the photo's own pixels. The live
 * overlay in the comparison viewer and the saved report both draw from this,
 * so the two always agree. Pure, so it is tested.
 */
export interface GuideSegment {
  from: Point;
  to: Point;
}

export interface SmileGuides {
  width: number;
  height: number;
  eyeLine: GuideSegment | null;
  midline: GuideSegment | null;
  mouthLine: GuideSegment;
  pupils: [Point, Point];
  commissures: [Point, Point];
  /** The upper edge of the lower lip, corner to corner: the smile-arc guide. */
  smileArc: Point[];
}

export type GuideKey = "eyeLine" | "midline" | "mouthLine" | "smileArc";

/** One colour per line, so a single image stays legible. */
export const GUIDE_STYLES: Record<GuideKey, { label: string; colour: string; dashed: boolean }> = {
  eyeLine: { label: "Eye line", colour: "#D8B872", dashed: false },
  midline: { label: "Facial midline", colour: "rgba(255, 255, 255, 0.95)", dashed: true },
  mouthLine: { label: "Mouth corners", colour: "#7CCBDF", dashed: false },
  smileArc: { label: "Smile arc", colour: "#86E0AE", dashed: false },
};

export const GUIDE_ORDER: GuideKey[] = ["eyeLine", "midline", "mouthLine", "smileArc"];

/** Mouth-corner line reach beyond each corner, as a share of the smile width. */
const MOUTH_REACH = 0.22;

/**
 * The part of the infinite line through `p` along `dir` that lies inside the
 * photo (Liang–Barsky), or null when it misses the photo entirely.
 */
export function clipLine(p: Point, dir: Point, width: number, height: number): GuideSegment | null {
  const len = Math.hypot(dir[0], dir[1]);
  if (!len || !(width > 0) || !(height > 0)) return null;
  const d: Point = [dir[0] / len, dir[1] / len];
  let lo = -Infinity, hi = Infinity;
  const bounds: [number, number, number][] = [[p[0], d[0], width], [p[1], d[1], height]];
  for (const [start, step, size] of bounds) {
    if (Math.abs(step) < 1e-12) {
      if (start < 0 || start > size) return null;
      continue;
    }
    const a = (0 - start) / step, b = (size - start) / step;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (!(hi > lo)) return null;
  return { from: [p[0] + d[0] * lo, p[1] + d[1] * lo], to: [p[0] + d[0] * hi, p[1] + d[1] * hi] };
}

export function smileGuides(a: SmileAnalysis, width: number, height: number): SmileGuides {
  const ipDir: Point = [a.midline.direction[1], -a.midline.direction[0]];
  const [c0, c1] = a.commissures;
  const span = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1;
  const ux = (c1[0] - c0[0]) / span, uy = (c1[1] - c0[1]) / span;
  const reach = span * MOUTH_REACH;
  return {
    width,
    height,
    eyeLine: clipLine(a.pupils[0], ipDir, width, height),
    midline: clipLine(a.midline.through, a.midline.direction, width, height),
    mouthLine: { from: [c0[0] - ux * reach, c0[1] - uy * reach], to: [c1[0] + ux * reach, c1[1] + uy * reach] },
    pupils: a.pupils,
    commissures: a.commissures,
    smileArc: a.lowerLipCurve,
  };
}

/** Scale guides measured on one photo onto another of the same framing but a different size. */
export function scaleGuides(g: SmileGuides, width: number, height: number): SmileGuides {
  const sx = width / g.width, sy = height / g.height;
  const p = (q: Point): Point => [q[0] * sx, q[1] * sy];
  const seg = (s: GuideSegment | null) => (s ? { from: p(s.from), to: p(s.to) } : null);
  return {
    width,
    height,
    eyeLine: seg(g.eyeLine),
    midline: seg(g.midline),
    mouthLine: seg(g.mouthLine)!,
    pupils: [p(g.pupils[0]), p(g.pupils[1])],
    commissures: [p(g.commissures[0]), p(g.commissures[1])],
    smileArc: g.smileArc.map(p),
  };
}

/**
 * A smooth curve through the points: quadratic segments via the midpoints,
 * ending on the last point. Each segment is [control, end].
 */
export function smoothCurve(points: Point[]): { start: Point; segments: [Point, Point][] } {
  if (points.length < 3) return { start: points[0] ?? [0, 0], segments: points.slice(1).map((q) => [q, q]) };
  const segments: [Point, Point][] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const next = points[i + 1];
    segments.push([points[i], [(points[i][0] + next[0]) / 2, (points[i][1] + next[1]) / 2]]);
  }
  const last = points[points.length - 1];
  segments.push([last, last]);
  return { start: points[0], segments };
}

const n = (v: number) => Math.round(v * 10) / 10;

/** The smile arc as SVG path data. */
export function smoothCurvePath(points: Point[]): string {
  const { start, segments } = smoothCurve(points);
  return `M${n(start[0])} ${n(start[1])}` + segments.map(([c, e]) => ` Q${n(c[0])} ${n(c[1])} ${n(e[0])} ${n(e[1])}`).join("");
}

/**
 * The frame around the face for the report: eyes to chin with a margin,
 * grown to the panel's shape and kept inside the photo.
 */
export function faceCrop(a: SmileAnalysis, aspect: number, width: number, height: number) {
  let { x, y, w, h } = a.faceBox;
  if (w / h > aspect) {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  } else {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  }
  // Larger than the photo: shrink, keeping the shape, about the same centre.
  const shrink = Math.min(1, width / w, height / h);
  if (shrink < 1) {
    x += (w - w * shrink) / 2;
    y += (h - h * shrink) / 2;
    w *= shrink;
    h *= shrink;
  }
  x = Math.min(Math.max(0, x), Math.max(0, width - w));
  y = Math.min(Math.max(0, y), Math.max(0, height - h));
  return { x, y, w, h };
}
