import {
  ALAE,
  COMMISSURES,
  GLABELLA,
  IRIS_LEFT,
  IRIS_RIGHT,
  LOWER_LIP_CURVE,
  OUTER_LIP,
  distance,
  pick,
  type Point,
} from "./geometry";

/**
 * Smile analysis from facial landmarks: the reference lines a smile design is
 * judged against (DSD-style), plus a few approximate measurements. Pure, so
 * it can be tested without a browser.
 *
 * Only things the landmarks measure reliably are reported. The dental
 * midline, incisal edges and gingival display need the teeth themselves to
 * be found, which this doesn't attempt — the clinician reads those against
 * the lines drawn here.
 */

/** Average adult horizontal iris diameter, used to turn pixels into mm. */
export const IRIS_DIAMETER_MM = 11.7;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SmileAnalysis {
  /** Iris centres, photo-left first. */
  pupils: [Point, Point];
  /** Point on the facial midline (glabella) and the midline's unit direction. */
  midline: { through: Point; direction: Point };
  /** Mouth corners, photo-left first. */
  commissures: [Point, Point];
  /** Outer edges of the nose wings, photo-left first: the nasal width lines pass through them. Absent from older saved analyses. */
  alae?: [Point, Point];
  /** Distance between the nasal width lines, across the face. */
  alarWidthPx?: number;
  /** Upper edge of the lower lip, corner to corner (smile-arc reference). */
  lowerLipCurve: Point[];
  /** Tilt of the interpupillary line from horizontal, degrees. */
  headTiltDeg: number;
  /** Mouth-corner line relative to the interpupillary line, degrees. */
  cantDeg: number;
  /** Signed: positive = the mouth centre sits to the photo's right of the midline. */
  midlineOffsetPx: number;
  midlineOffsetMm: number | null;
  smileWidthPx: number;
  smileWidthMm: number | null;
  mmPerPx: number | null;
  faceBox: Box;
  mouthBox: Box;
}

const degrees = (r: number) => (r * 180) / Math.PI;

/** Angle of the line a→b, folded into (−90°, 90°] so direction doesn't matter. */
function lineAngle(a: Point, b: Point): number {
  let t = Math.atan2(b[1] - a[1], b[0] - a[0]);
  if (t > Math.PI / 2) t -= Math.PI;
  if (t <= -Math.PI / 2) t += Math.PI;
  return t;
}

function irisDiameter(points: Point[], ring: readonly number[]): number {
  const [r0, r1, r2, r3] = pick(points, ring);
  return (distance(r0, r2) + distance(r1, r3)) / 2;
}

function bounds(points: Point[]): Box {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function clampBox(box: Box, width: number, height: number): Box {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(width, box.x + box.w) - x),
    h: Math.max(1, Math.min(height, box.y + box.h) - y),
  };
}

export function analyseSmile(
  points: Point[] | null,
  imageWidth: number,
  imageHeight: number,
): SmileAnalysis | null {
  if (!points || points.length < 478) return null;

  const pupilsRaw: [Point, Point] = [points[IRIS_RIGHT.centre], points[IRIS_LEFT.centre]];
  const pupils = (pupilsRaw[0][0] <= pupilsRaw[1][0] ? pupilsRaw : [pupilsRaw[1], pupilsRaw[0]]) as [Point, Point];
  const [c0, c1] = pick(points, COMMISSURES);
  const commissures = (c0[0] <= c1[0] ? [c0, c1] : [c1, c0]) as [Point, Point];
  const ipd = distance(pupils[0], pupils[1]);
  const smileWidthPx = distance(commissures[0], commissures[1]);
  if (!(ipd > 10) || !(smileWidthPx > 10)) return null;

  const ipAngle = lineAngle(pupils[0], pupils[1]);
  const cantDeg = degrees(lineAngle(commissures[0], commissures[1]) - ipAngle);

  // Facial midline: perpendicular to the interpupillary line through the
  // glabella — the reference DSD uses, rather than trusting the nose tip.
  const through = points[GLABELLA];
  const direction: Point = [-Math.sin(ipAngle), Math.cos(ipAngle)];
  const mouthCentre: Point = [
    (commissures[0][0] + commissures[1][0]) / 2,
    (commissures[0][1] + commissures[1][1]) / 2,
  ];
  // Signed distance along the interpupillary direction.
  const midlineOffsetPx =
    (mouthCentre[0] - through[0]) * Math.cos(ipAngle) +
    (mouthCentre[1] - through[1]) * Math.sin(ipAngle);

  const irisPx =
    (irisDiameter(points, IRIS_RIGHT.ring) + irisDiameter(points, IRIS_LEFT.ring)) / 2;
  const mmPerPx = irisPx > 6 ? IRIS_DIAMETER_MM / irisPx : null;

  // The outer edge of each nose wing: its most lateral point, measured across the face.
  const across = (p: Point) => (p[0] - through[0]) * Math.cos(ipAngle) + (p[1] - through[1]) * Math.sin(ipAngle);
  const outermost = (ids: readonly number[], sign: 1 | -1) => pick(points, ids).reduce((best, p) => (sign * across(p) > sign * across(best) ? p : best));
  const sideA = outermost(ALAE.right, -1), sideB = outermost(ALAE.left, 1);
  const alae = (across(sideA) <= across(sideB) ? [sideA, sideB] : [outermost(ALAE.left, -1), outermost(ALAE.right, 1)]) as [Point, Point];
  const alarWidthPx = Math.abs(across(alae[1]) - across(alae[0]));

  const lowerLip = pick(points, LOWER_LIP_CURVE);
  const lowerLipCurve = lowerLip[0][0] <= lowerLip[lowerLip.length - 1][0] ? lowerLip : [...lowerLip].reverse();

  const all = bounds(points);
  const faceBox = clampBox(
    { x: all.x - all.w * 0.1, y: all.y - all.h * 0.06, w: all.w * 1.2, h: all.h * 1.12 },
    imageWidth,
    imageHeight,
  );
  const lips = bounds(pick(points, OUTER_LIP));
  const mouthW = lips.w * 1.5;
  const mouthH = Math.max(lips.h * 2, mouthW * 0.55);
  const mouthBox = clampBox(
    { x: lips.x + lips.w / 2 - mouthW / 2, y: lips.y + lips.h / 2 - mouthH / 2, w: mouthW, h: mouthH },
    imageWidth,
    imageHeight,
  );

  return {
    pupils,
    midline: { through, direction },
    commissures,
    alae,
    alarWidthPx,
    lowerLipCurve,
    headTiltDeg: degrees(ipAngle),
    cantDeg,
    midlineOffsetPx,
    midlineOffsetMm: mmPerPx ? midlineOffsetPx * mmPerPx : null,
    smileWidthPx,
    smileWidthMm: mmPerPx ? smileWidthPx * mmPerPx : null,
    mmPerPx,
    faceBox,
    mouthBox,
  };
}

export interface AnalysisRow {
  label: string;
  value: string;
  note: string;
  /** For the key over the viewer, where space is tight. */
  shortLabel: string;
  shortValue: string;
}

const round1 = (n: number) => (Math.round(Math.abs(n) * 10) / 10).toFixed(1);

/** The measurements in plain words, for the analysis sheet. */
export function analysisRows(a: SmileAnalysis): AnalysisRow[] {
  const rows: AnalysisRow[] = [];
  const tilt = Math.abs(a.headTiltDeg);
  rows.push({
    label: "Head tilt",
    value: `${round1(a.headTiltDeg)}°`,
    note: tilt <= 2 ? "Photo is level" : "Photo or head is tilted — lines follow the eyes",
    shortLabel: "Head tilt",
    shortValue: `${round1(a.headTiltDeg)}°`,
  });
  const cant = Math.abs(a.cantDeg);
  rows.push({
    label: "Mouth corners vs eyes",
    value: `${round1(a.cantDeg)}°`,
    note: cant <= 2 ? "Reads level with the eyes" : "Mouth corners slope relative to the eyes",
    shortLabel: "Corners vs eyes",
    shortValue: `${round1(a.cantDeg)}°`,
  });
  const offset = a.smileWidthPx ? a.midlineOffsetPx / a.smileWidthPx * 100 : 0;
  const centred = Math.abs(offset) < 1;
  const side = offset > 0 ? "to photo right" : "to photo left";
  rows.push({
    label: "Smile centre vs facial midline",
    value: centred ? "Centred" : `${round1(offset)}% of mouth width ${side}`,
    note: "Mouth-centre guide, not a dental-midline measurement. No calibrated millimetres are available.",
    shortLabel: "Smile centre",
    shortValue: centred ? "Centred" : `${round1(offset)}% ${side}`,
  });
  if (a.alarWidthPx && a.smileWidthPx > 0) {
    const share = Math.round((a.alarWidthPx / a.smileWidthPx) * 100);
    rows.push({
      label: "Nasal width",
      value: `${share}% of smile width`,
      note: "Lines through the outer edges of the nose, a common reference for where the canines sit.",
      shortLabel: "Nasal width",
      shortValue: `${share}% of smile`,
    });
  }
  return rows;
}
