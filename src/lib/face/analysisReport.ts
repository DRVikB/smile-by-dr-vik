import { analyseSmile, type Box, type SmileAnalysis } from "./analysis";
import type { Point } from "./geometry";
import { faceCrop, GUIDE_STYLES, scaleGuides, smileGuides, smoothCurve, type GuideKey, type SmileGuides } from "./guides";
import { detectFace } from "./landmarks";

/**
 * The face analysis behind the Consultation Report, built on the device from
 * facial landmarks — no AI call. The patient's own face (the before photo)
 * gives the observations; the reference lines on the concept photo are drawn
 * only when the clinician asks for the technical detail.
 */
export interface ReportAnalysis {
  /** Measured on the before photo: the patient's own face. */
  face: SmileAnalysis | null;
  /** The lines placed on the concept photo, with a frame around the face. */
  figure: { guides: SmileGuides; crop: Box } | null;
}

export const NO_ANALYSIS: ReportAnalysis = { face: null, figure: null };

export const ANALYSIS_CAVEAT =
  "Relative guides found on this device from facial landmarks. They don’t measure teeth or gums.";

const within = <T,>(job: Promise<T>, ms: number, fallback: T) =>
  Promise.race([job, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

const scaleBox = (b: Box, sx: number, sy: number): Box => ({ x: b.x * sx, y: b.y * sy, w: b.w * sx, h: b.h * sy });

/**
 * Landmarks for both photos, or nothing when they show no full face (a
 * close-up) or the face model can't load in time — the report is then made
 * without observations rather than held up.
 */
export async function prepareReportAnalysis(before: string, after: string, aspect = 4 / 5, timeoutMs = 9000): Promise<ReportAnalysis> {
  try {
    const [beforeSize, afterSize, [beforePts, afterPts]] = await Promise.all([
      naturalSize(before),
      naturalSize(after),
      within(Promise.all([detectFace(before), detectFace(after)]), timeoutMs, [null, null] as [Point[] | null, Point[] | null]),
    ]);
    const face = analyseSmile(beforePts, beforeSize.width, beforeSize.height);
    const onAfter = analyseSmile(afterPts, afterSize.width, afterSize.height);
    // The concept is face-locked to the before, so either set places the lines;
    // its own sit exactly on what's shown.
    const figure = onAfter
      ? { guides: smileGuides(onAfter, afterSize.width, afterSize.height), crop: faceCrop(onAfter, aspect, afterSize.width, afterSize.height) }
      : face
        ? {
            guides: scaleGuides(smileGuides(face, beforeSize.width, beforeSize.height), afterSize.width, afterSize.height),
            crop: faceCrop({ ...face, faceBox: scaleBox(face.faceBox, afterSize.width / beforeSize.width, afterSize.height / beforeSize.height) }, aspect, afterSize.width, afterSize.height),
          }
        : null;
    return { face, figure };
  } catch {
    return NO_ANALYSIS;
  }
}

/** Every reference line on one photograph, clipped to its panel. */
export function drawGuides(
  ctx: CanvasRenderingContext2D,
  g: SmileGuides,
  map: (p: Point) => Point,
  panel: Box,
  scale: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(panel.x, panel.y, panel.w, panel.h);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 4 * scale;
  const stroke = (key: GuideKey, width = 2.6) => {
    ctx.strokeStyle = GUIDE_STYLES[key].colour;
    ctx.lineWidth = width * scale;
    ctx.setLineDash(GUIDE_STYLES[key].dashed ? [10 * scale, 8 * scale] : []);
  };
  const segment = (key: GuideKey, s: { from: Point; to: Point } | null) => {
    if (!s) return;
    stroke(key);
    const a = map(s.from), b = map(s.to);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };
  const dot = (p: Point, colour: string) => {
    const q = map(p);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(q[0], q[1], 5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  segment("eyeLine", g.eyeLine);
  segment("midline", g.midline);
  g.nasalLines?.forEach((s) => segment("nasalLines", s));
  segment("mouthLine", g.mouthLine);
  stroke("smileArc", 3);
  const { start, segments } = smoothCurve(g.smileArc.map(map));
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (const [c, e] of segments) ctx.quadraticCurveTo(c[0], c[1], e[0], e[1]);
  ctx.stroke();
  g.pupils.forEach((p) => dot(p, GUIDE_STYLES.eyeLine.colour));
  g.commissures.forEach((p) => dot(p, GUIDE_STYLES.mouthLine.colour));
  ctx.restore();
}
