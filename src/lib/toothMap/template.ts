import type { SmileSettings, ToothPlan } from "../types";
import { closedCurvePath, openCurvePath, toothShapes, type Point, type ToothShape } from "./outline";
import type { ToothMap } from "./types";

/*
 * SmileDesignOverlay geometry: clean vector tooth templates fitted to the
 * patient's detected teeth.
 *
 * Two layers stay separate:
 *   - TECHNICAL (detection + SlimSAM, ToothRegion.outline): where each tooth
 *     really is. Used for masks, generation, protection and compositing.
 *   - DISPLAY (this file): what the clinician sees. Canonical crown templates
 *     (central, lateral, canine, premolar) in a morphology family, each
 *     scaled, positioned and rotated from its detected tooth, then smoothed
 *     so the row reads as one designed smile.
 * Nothing here is ever used to build a mask.
 *
 * The fitted geometry (ToothDesign) is plain data — centre, incisal edge,
 * width, height, axis — so a proposed design can later be adjusted per tooth
 * (width, length, axis, vertical and mesio-distal position) or defined ahead
 * of generation, without changing how it is drawn.
 */

export type Proportion = "natural" | "golden" | "red";
export type TemplateFamily = "natural" | "soft-square" | "square" | "rounded" | "tapered";
export type ToothKind = "central" | "lateral" | "canine" | "premolar";

/** Visible width of each tooth relative to the central, from the midline outward (central … second premolar). */
export const PROPORTIONS: Record<Proportion, number[]> = {
  // Typical visible widths of a natural smile seen from the front.
  natural: [1, 0.72, 0.62, 0.48, 0.4],
  // Golden proportion: each tooth 61.8% of the one in front.
  golden: [1, 0.618, 0.382, 0.3, 0.26],
  // Recurring esthetic dental proportion, 70%.
  red: [1, 0.7, 0.49, 0.36, 0.3],
};
/** Visible crown height relative to the central. */
const HEIGHTS = [1, 0.86, 0.95, 0.82, 0.76];
/** Ideal long-axis lean (degrees), gum end away from the midline, increasing towards the back. */
const TILTS = [1.5, 3.5, 6, 7.5, 8.5];
const KINDS: ToothKind[] = ["central", "lateral", "canine", "premolar", "premolar"];

export function kindOf(fdi: number): ToothKind {
  return KINDS[Math.min(4, (fdi % 10) - 1)] ?? "premolar";
}

/* ---------- Canonical crowns ---------- */

/** Morphology family: neck width, where the crown is widest, incisal inset and incisal corner radius. */
const FAMILIES: Record<TemplateFamily, { neck: number; bulge: number; inset: number; radius: number }> = {
  square: { neck: 0.33, bulge: 0.45, inset: 0.01, radius: 0.07 },
  "soft-square": { neck: 0.31, bulge: 0.47, inset: 0.02, radius: 0.14 },
  natural: { neck: 0.29, bulge: 0.5, inset: 0.03, radius: 0.2 },
  rounded: { neck: 0.27, bulge: 0.52, inset: 0.05, radius: 0.3 },
  tapered: { neck: 0.21, bulge: 0.62, inset: 0, radius: 0.12 },
};
/** Tooth type: incisal corner character (mesial / distal multipliers) and cusp. */
const TYPES: Record<ToothKind, { mesial: number; distal: number; cusp: number; cuspX: number }> = {
  central: { mesial: 0.7, distal: 1.1, cusp: 0, cuspX: 0 },
  lateral: { mesial: 0.9, distal: 1.6, cusp: 0, cuspX: 0 },
  canine: { mesial: 1.3, distal: 1.5, cusp: 0.17, cuspX: -0.05 },
  premolar: { mesial: 1.4, distal: 1.4, cusp: 0.1, cuspX: 0 },
};

/**
 * A crown outline in a unit box: x from −0.5 (mesial, towards the midline)
 * to 0.5 (distal); y from 0 (gum) to 1 (incisal edge / cusp tip). Clockwise
 * from the gingival scallop; drawn as a smooth closed curve.
 */
export function crownOutline(kind: ToothKind, family: TemplateFamily): Point[] {
  const f = FAMILIES[family], t = TYPES[kind];
  const rM = Math.min(0.42, f.radius * t.mesial), rD = Math.min(0.42, f.radius * t.distal);
  const edgeY = 1 - t.cusp; // incisal corners sit lower on a cusped tooth
  const xe = 0.5 - f.inset;
  const pts: Point[] = [];
  // Gingival scallop, zenith slightly distal.
  for (let i = 0; i <= 6; i++) {
    const x = -f.neck + (2 * f.neck * i) / 6;
    pts.push([x, 0.06 * ((x - 0.04 * f.neck) / f.neck) ** 2]);
  }
  // Distal side down to the corner.
  pts.push([f.neck + (0.5 - f.neck) * 0.55, f.bulge * 0.45], [0.5, f.bulge], [xe, edgeY - rD - 0.02]);
  for (let a = 1; a <= 3; a++) {
    const th = (a / 4) * (Math.PI / 2);
    pts.push([xe - rD + rD * Math.cos(th), edgeY - rD + rD * Math.sin(th)]);
  }
  // Incisal edge (or cusp), distal to mesial.
  const x0 = xe - rD, x1 = -xe + rM;
  const edge: number[] = Array.from({ length: 7 }, (_, i) => x0 + ((x1 - x0) * i) / 6);
  if (t.cusp) edge.push(t.cuspX); // the cusp tip itself
  for (const x of edge.sort((a, b) => b - a)) {
    const span = x < t.cuspX ? t.cuspX - x1 : x0 - t.cuspX;
    pts.push([x, edgeY + t.cusp * (1 - Math.min(1, Math.abs(x - t.cuspX) / Math.max(1e-6, span)))]);
  }
  // Mesial corner and side back up to the neck.
  for (let a = 3; a >= 1; a--) {
    const th = (a / 4) * (Math.PI / 2);
    pts.push([-xe + rM - rM * Math.cos(th), edgeY - rM + rM * Math.sin(th)]);
  }
  pts.push([-xe, edgeY - rM - 0.02], [-0.5, f.bulge], [-f.neck - (0.5 - f.neck) * 0.55, f.bulge * 0.45]);
  return pts;
}

/** The design's family: each tooth's own shape, else the Shape step. */
export function familyFor(settings: Pick<SmileSettings, "shape" | "toothPlans">, fdi: number): TemplateFamily {
  const plan: ToothPlan | undefined = settings.toothPlans?.find(p => p.tooth === fdi);
  if (plan?.shape === "Soft square") return "soft-square";
  if (plan?.shape === "Square") return "square";
  if (plan?.shape === "Rounded") return "rounded";
  return settings.shape === "Square" ? "square" : settings.shape === "Rectangular" ? "soft-square" : settings.shape === "Rounded" ? "rounded" : settings.shape === "Triangular" ? "tapered" : "natural";
}

/* ---------- Fitting ---------- */

/** One tooth of the proposed design: plain geometry, adjustable later. */
export interface ToothDesign {
  fdi: number;
  kind: ToothKind;
  family: TemplateFamily;
  /** Centre of the crown's width, and the incisal edge's height, in photo pixels. */
  cx: number;
  incisalY: number;
  width: number;
  height: number;
  /** Long-axis lean in degrees (positive: gum end towards image right). */
  angle: number;
  /** "fitted" from a detected tooth, or "ideal" where the map found none believable. */
  source: "fitted" | "ideal";
  /** Whether the tooth map found this tooth (only mapped teeth can change). */
  mapped: boolean;
}

export interface TemplateTooth extends ToothDesign {
  /** The outline, as an SVG path in photo pixels. */
  path: string;
  /** Long axis, from beyond the gum to beyond the incisal edge. */
  axis: [Point, Point];
  gingival: Point;
  incisal: Point;
  /** Where the number sits (above the crown). */
  label: Point;
}

export interface VerticalGuide { x: number; y0: number; y1: number }

export interface SmileTemplate {
  teeth: TemplateTooth[];
  arc: string;
  midline: VerticalGuide;
  /**
   * Proportion lines, as in a smile-design worksheet: the midline, each
   * anterior contact and the canines' distal edges (canine to canine).
   */
  contacts: VerticalGuide[];
  /** Horizontal line across the crown tops (the centrals' gingival level), canine to canine. */
  topLine: { y: number; x0: number; x1: number };
  /** Smile arc along the incisal edges, canine to canine. */
  incisalArc: string;
  /** The inner lip, for clipping the teeth behind the lips (photo pixels). */
  clip: Point[] | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Least-squares parabola y = a·(x − m)² + b·(x − m) + c. */
function fitParabola(points: Point[], m: number): { a: number; b: number; c: number } | null {
  if (points.length < 3) return null;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const [x, y] of points) {
    const u = x - m;
    s0 += 1; s1 += u; s2 += u * u; s3 += u ** 3; s4 += u ** 4; t0 += y; t1 += u * y; t2 += u * u * y;
  }
  const det = (q: number[][]) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const D = det([[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]]);
  if (Math.abs(D) < 1e-9) return null;
  return {
    a: det([[t2, s3, s2], [t1, s2, s1], [t0, s1, s0]]) / D,
    b: det([[s4, t2, s2], [s3, t1, s1], [s2, t0, s0]]) / D,
    c: det([[s4, s3, t2], [s3, s2, t1], [s2, s1, t0]]) / D,
  };
}

/** Curvature of the lower lip's inner edge around the midline. */
function lowerLipCurvature(lip: Point[], mx: number, cy: number): number | null {
  const lower = lip.filter(([, y]) => y > cy);
  if (lower.length < 3) return null;
  const ymax = Math.max(...lower.map(p => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of lower) { const u = (x - mx) ** 2; num += u * (y - ymax); den += u * u; }
  return den ? num / den : null;
}

/** Place a template tooth: unit crown → photo pixels, mesial towards the midline on both sides. */
export function renderToothDesign(d: ToothDesign, labelLift: number): TemplateTooth {
  const side = d.fdi < 20 ? -1 : 1;
  const rad = (d.angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const place = ([ux, uy]: Point): Point => {
    const lx = ux * side * d.width, ly = (uy - 1) * d.height;
    return [d.cx + lx * cos - ly * sin, d.incisalY + lx * sin + ly * cos];
  };
  const gingival = place([0, 0]);
  return {
    ...d,
    path: closedCurvePath(crownOutline(d.kind, d.family).map(place)),
    axis: [place([0, -0.35]), place([0, 1.25])],
    gingival,
    incisal: place([0, 1]),
    label: [gingival[0], gingival[1] - labelLift],
  };
}

/**
 * Fit the template to this smile. Detected teeth set each template's
 * position, size and axis; ideal proportions fill in and smooth it
 * (matched centrals at the midline, a steady width progression, contacts
 * without overlaps, one smile arc). Returns null when there's nothing to fit.
 */
export function fitSmileTemplate(map: ToothMap | null, width: number, height: number, options: {
  settings: Pick<SmileSettings, "shape" | "toothPlans">;
  proportion?: Proportion;
}): SmileTemplate | null {
  if (!map) return null;
  const px = ([x, y]: [number, number]): Point => [x * width, y * height];
  const lip = map.mouthOpening?.length ? map.mouthOpening.map(px) : null;
  const shapes = toothShapes(map, width, height, []);
  if (!lip && !shapes.length) return null;
  const extentX = lip ? [Math.min(...lip.map(p => p[0])), Math.max(...lip.map(p => p[0]))] : [Math.min(...shapes.map(s => s.left)), Math.max(...shapes.map(s => s.right))];
  const extentY = lip ? [Math.min(...lip.map(p => p[1])), Math.max(...lip.map(p => p[1]))] : [Math.min(...shapes.map(s => s.top)), Math.max(...shapes.map(s => s.bottom))];
  const mouthW = extentX[1] - extentX[0], mouthH = Math.max(1, extentY[1] - extentY[0]);
  const byFdi = new Map(shapes.filter(s => s.fdi !== null).map(s => [s.fdi as number, s]));

  // Centrals: trusted when both are found at a believable, matching size.
  const c11 = byFdi.get(11), c21 = byFdi.get(21);
  const believable = (s: ToothShape | undefined): s is ToothShape => s !== undefined && s.width > mouthW * 0.05 && s.width < mouthW * 0.35 && s.height > s.width * 0.6 && s.height < s.width * 2.2;
  const pair = believable(c11) && believable(c21) && Math.min(c11.width, c21.width) / Math.max(c11.width, c21.width) > 0.7 ? [c11, c21] : null;
  const centrals = pair ?? [c11, c21].filter(believable);
  const midX = pair ? (Math.min(pair[0].right, pair[1].left) + Math.max(pair[0].right, pair[1].left)) / 2 : (extentX[0] + extentX[1]) / 2;
  const W = clamp(centrals.length ? mean(centrals.map(s => s.width)) : mouthW * 0.125, mouthW * 0.07, mouthW * 0.3);
  const Hc = clamp(centrals.length ? Math.min(...centrals.map(s => s.height)) : W * 1.2, W, W * 1.45);

  const ratios = PROPORTIONS[options.proportion ?? "natural"];
  const plausible = (s: ToothShape | undefined, i: number): s is ToothShape =>
    s !== undefined && s.width > W * ratios[i] * 0.45 && s.width < W * ratios[i] * 1.7 && s.height > Hc * HEIGHTS[i] * 0.55 && s.height < Hc * HEIGHTS[i] * 1.5;

  // Smile arc: through the detected incisal edges when they form a smile curve; otherwise following the lower lip.
  const incisalPoints: Point[] = [];
  for (const q of [10, 20]) for (let i = 0; i < 5; i++) { const s = byFdi.get(q + i + 1); if (plausible(s, i)) incisalPoints.push(s.incisal); }
  const maxCurve = 2.4 * mouthH / (mouthW * mouthW);
  const baseY = centrals.length ? mean(centrals.map(s => s.incisal[1])) : extentY[0] + Math.min(mouthH * 0.72, Hc);
  const fit = incisalPoints.length >= 4 ? fitParabola(incisalPoints, midX) : null;
  const lipA = lip ? lowerLipCurvature(lip, midX, (extentY[0] + extentY[1]) / 2) : null;
  const lipCurve = clamp((lipA ?? -1.2 * mouthH / (mouthW * mouthW)) * 0.75, -maxCurve, 0);
  const curve = fit && fit.a <= 0 && fit.a > -maxCurve ? fit.a : lipCurve;
  // A little of the detected tilt (b), none of its noise: the arc stays nearly symmetric.
  const tilt = fit ? clamp(fit.b, -0.08, 0.08) * 0.3 : 0;
  const arcY = (x: number) => baseY + curve * (x - midX) ** 2 + tilt * (x - midX);

  // Widths: detected where believable, pulled towards the ideal progression, matched side to side.
  const blended = (q: number, i: number) => { const s = byFdi.get(q + i + 1); return plausible(s, i) ? lerp(W * ratios[i], s.width, 0.6) : W * ratios[i]; };
  const widths: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = i === 0 ? W : (blended(10, i) + blended(20, i)) / 2;
    widths.push(i === 0 ? w : clamp(w, widths[i - 1] * 0.55, widths[i - 1] * 1.02));
  }
  const heights = HEIGHTS.map((r, i) => {
    if (i === 0) return Hc;
    const found = [10, 20].map(q => byFdi.get(q + i + 1)).filter((s): s is ToothShape => plausible(s, i));
    const h = found.length ? lerp(Hc * r, mean(found.map(s => s.height)), 0.5) : Hc * r;
    return Math.min(h, Hc * (i === 2 ? 1 : 0.95));
  });

  const labelLift = Hc * 0.14;
  const designs: ToothDesign[] = [];
  const contacts: VerticalGuide[] = [];
  for (const side of [-1, 1] as const) {
    // side −1: image left = patient's right (quadrant 1); side 1: image right (quadrant 2).
    const q = side < 0 ? 10 : 20;
    let edge = 0; // distance from the midline to the previous tooth's distal contact
    for (let i = 0; i < 5; i++) {
      const fdi = q + i + 1;
      const s = byFdi.get(fdi);
      const found = plausible(s, i);
      const w = widths[i];
      // Follow the detected position, but never overlap the neighbour or leave a large gap; centrals meet at the midline.
      let start = edge;
      if (found && i > 0) start = clamp(lerp(edge, side < 0 ? midX - s.right : s.left - midX, 0.5), edge, edge + w * 0.2);
      const cx = midX + side * (start + w / 2);
      const idealY = arcY(cx);
      const incisalY = found && Math.abs(s.incisal[1] - idealY) < Hc * 0.25 ? lerp(idealY, s.incisal[1], 0.3) : idealY;
      const idealAngle = side * TILTS[i];
      const angle = found ? clamp(lerp(idealAngle, -(s.axis * 180) / Math.PI, 0.4), idealAngle - 8, idealAngle + 8) : idealAngle;
      designs.push({ fdi, kind: KINDS[i], family: familyFor(options.settings, fdi), cx, incisalY, width: w, height: heights[i], angle, source: found ? "fitted" : "ideal", mapped: s !== undefined });
      edge = start + w;
      // Proportion lines at the anterior contacts and the canine's distal edge.
      if (i < 3) contacts.push({ x: midX + side * edge, y0: 0, y1: 0 });
    }
  }
  // Centrals level and matched: one edge height for the pair.
  const pairY = mean(designs.filter(d => d.kind === "central").map(d => d.incisalY));
  const teeth = designs.map(d => renderToothDesign(d.kind === "central" ? { ...d, incisalY: pairY } : d, labelLift));

  const byX = [...teeth].sort((a, b) => a.cx - b.cx);
  const span = Math.max(byX[byX.length - 1].cx + byX[byX.length - 1].width / 2 - midX, midX - (byX[0].cx - byX[0].width / 2));
  const arcHalf = Math.min(span + W * 0.25, mouthW * 0.5);
  const arcPoints: Point[] = Array.from({ length: 25 }, (_, i) => { const x = midX - arcHalf + (2 * arcHalf * i) / 24; return [x, arcY(x)]; });
  // Worksheet guides span canine to canine and reach well beyond the crowns.
  const canineEdge = Math.max(...contacts.map(c => Math.abs(c.x - midX)), W);
  const topY = Math.min(...teeth.filter(t => t.kind === "central").map(t => t.gingival[1]));
  const lines: VerticalGuide[] = [{ x: midX, y0: 0, y1: 0 }, ...contacts].map(c => ({ x: c.x, y0: topY - Hc * 0.75, y1: pairY + Hc * 0.75 }));
  const anteriorArc: Point[] = Array.from({ length: 17 }, (_, i) => { const x = midX - canineEdge + (2 * canineEdge * i) / 16; return [x, arcY(x)]; });
  return {
    teeth,
    arc: openCurvePath(arcPoints),
    midline: { x: midX, y0: pairY - Hc * 1.9, y1: pairY + Hc * 0.9 },
    contacts: lines,
    topLine: { y: topY, x0: midX - canineEdge, x1: midX + canineEdge },
    incisalArc: openCurvePath(anteriorArc),
    clip: lip,
  };
}
