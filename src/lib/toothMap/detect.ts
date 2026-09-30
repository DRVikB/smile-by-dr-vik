import { analyseSmile } from "../face/analysis";
import { INNER_LIP, pick, type Point } from "../face/geometry";
import type { Photo } from "../types";
import { findTeethRegion, segmentTeeth, type SegmentResult } from "./segment";
import { photoFingerprint, TOOTH_MAP_VERSION, type NormPoint, type ToothMap, type ToothRegion } from "./types";

/** Confidence below this asks the clinician to check the tooth. Never shown as a number to patients. */
export const REVIEW_BELOW = 0.6;
/** Working width for segmentation: fast on a phone, detailed enough for tooth boundaries. */
const WORK_WIDTH = 640;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo could not be opened."));
    img.src = src;
  });
}

/**
 * Find every visible upper tooth in the photo, on this device. Full face: the
 * face landmarks give the mouth opening and the facial midline to number
 * from. Close-up (or no face found): the teeth are found directly. Returns
 * null when no teeth can be found; the clinician can still add them by hand.
 */
export interface DetectionDebug {
  crop: { x: number; y: number; w: number; h: number };
  scale: number;
  result: SegmentResult;
  width: number;
  height: number;
}

export async function detectToothMap(photo: Pick<Photo, "dataUrl">, shotType: "Full face" | "Close-up" = "Full face", onDebug?: (info: DetectionDebug) => void): Promise<ToothMap | null> {
  const img = await loadImage(photo.dataUrl);
  const W = img.naturalWidth, H = img.naturalHeight;
  let mouth: Point[] | null = null;
  let midlineAt: ((y: number) => number) | null = null;
  if (shotType !== "Close-up") {
    const { detectFace } = await import("../face/landmarks");
    const points = await detectFace(photo.dataUrl).catch(() => null);
    if (points && points.length >= 468) {
      mouth = pick(points, INNER_LIP);
      const analysis = analyseSmile(points, W, H);
      if (analysis) {
        const { through, direction } = analysis.midline;
        midlineAt = (y: number) => through[0] + (direction[1] ? ((y - through[1]) / direction[1]) * direction[0] : 0);
      }
    }
  }

  // Work on the mouth (with a margin), or the whole photo for a close-up.
  let crop = { x: 0, y: 0, w: W, h: H };
  if (mouth) {
    const xs = mouth.map(p => p[0]), ys = mouth.map(p => p[1]);
    const mw = Math.max(...xs) - Math.min(...xs), mh = Math.max(...ys) - Math.min(...ys);
    if (mw < 20 || mh < 4) return null;
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - mw * 0.06)), x1 = Math.min(W, Math.ceil(Math.max(...xs) + mw * 0.06));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - mh * 0.15)), y1 = Math.min(H, Math.ceil(Math.max(...ys) + mh * 0.15));
    crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const scale = Math.min(1, WORK_WIDTH / crop.w);
  const cw = Math.max(1, Math.round(crop.w * scale)), ch = Math.max(1, Math.round(crop.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
  const rgba = ctx.getImageData(0, 0, cw, ch).data;
  // No face: find the teeth's own region so skin elsewhere is never read as teeth.
  const closeUpRegion = mouth ? null : findTeethRegion(rgba, cw, ch);
  if (!mouth && !closeUpRegion) return null;
  const toCrop = (p: Point): Point => [(p[0] - crop.x) * scale, (p[1] - crop.y) * scale];
  const mouthCenterY = mouth ? mouth.reduce((s, p) => s + p[1], 0) / mouth.length : crop.y + crop.h / 2;
  const result = segmentTeeth({
    rgba, width: cw, height: ch,
    mouth: mouth ? mouth.map(toCrop) : closeUpRegion,
    midlineX: midlineAt ? (midlineAt(mouthCenterY) - crop.x) * scale : null,
  });
  onDebug?.({ crop, scale, result, width: cw, height: ch });
  if (!result.teeth.length) return null;

  const toNorm = (p: Point): NormPoint => [(p[0] / scale + crop.x) / W, (p[1] / scale + crop.y) / H];
  const teeth: ToothRegion[] = result.teeth.map((t, i) => {
    const outline = t.outline.map(toNorm);
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    const id = `t${i}-${Math.round(t.centroid[0])}`;
    return {
      id,
      fdi: t.fdi,
      detectedIndex: i,
      confidence: Math.round(t.confidence * 100) / 100,
      bbox: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
      centroid: { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length },
      outline,
      exactMaskRef: `outline:${id}`,
      influenceMaskRef: `influence:${id}`,
      visible: true,
      selected: false,
      requiresReview: t.confidence < REVIEW_BELOW || t.fdi === null,
      source: "detected",
    };
  });
  return {
    photoId: photoFingerprint(photo.dataUrl),
    arch: "upper",
    teeth,
    confirmedByClinician: false,
    version: TOOTH_MAP_VERSION,
    method: "on-device-v1",
    mouthOpening: mouth ? mouth.map(p => [p[0] / W, p[1] / H] as NormPoint) : undefined,
  };
}
