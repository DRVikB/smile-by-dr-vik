import type { MouthAlignmentDiagnostic } from "./alignmentDiagnostic";
import { releaseCanvas } from "../canvasMemory";
import { compositeMasked, measureProtectedRegionChange, editableRegionRange } from "./geometry";
import { detectFace, detectFaceDetailed } from "./landmarks";
import { planMouthLock, pixelLockPlan, mouthTransitionMask, lipsCanBeFollowed, type MouthLockFailure } from "./lock";
import { alignByPixels, pixelMatchAccepted, samePhotograph } from "./pixelAlign";
import { INNER_LIP, OUTER_LIP, pick, pointInPolygon } from "./geometry";

export interface MouthLockResult {
  image: string;
  /** True when the source outer-lip contour and surrounding face are restored. */
  locked: boolean;
  lipsMoved: boolean;
  /** Full arch: the result's parted lips were kept, blended into the original face (see lock.ts). */
  lipsFollowed?: boolean;
  /** The source has a face but the returned image cannot be aligned to it. */
  invalidAlignment?: boolean;
  failureReason?: MouthLockFailure;
}

/** Mean brightness difference over the lips (outer lip outline less the opening), generated shifted by dx, dy. */
function lipDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, points: [number, number][], dx: number, dy: number): number | null {
  const outer = pick(points, OUTER_LIP), inner = pick(points, INNER_LIP);
  const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
  const step = Math.max(1, Math.round((Math.max(...xs) - Math.min(...xs)) / 160));
  const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let sum = 0, n = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y += step)
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x += step) {
      if (!pointInPolygon([x, y], outer) || pointInPolygon([x, y], inner)) continue;
      const xb = x - dx, yb = y - dy;
      if (xb < 0 || yb < 0 || xb >= width || yb >= height) continue;
      sum += Math.abs(luma(a, (y * width + x) * 4) - luma(b, (yb * width + xb) * 4)); n++;
    }
  return n >= 50 ? sum / n : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/**
 * Put the AI edit back onto the original photograph so that nothing outside
 * the source outer lip contour can change. Stable inner lip texture can blend
 * with the dental edit; surrounding skin, eyes, nose, hair and background are
 * the patient's own pixels. Moved lips use the stricter source opening. If the face can't be found, the edit is returned
 * untouched rather than guessed at.
 */
export async function lockFaceOutsideLips(
  original: string,
  generated: string,
  report?: (diagnostic: MouthAlignmentDiagnostic) => void,
  options: { followLips?: boolean } = {},
): Promise<MouthLockResult> {
  const untouched = { image: generated, locked: false, lipsMoved: false };
  let failureReason: MouthLockFailure = "mouth_image_decode_failed";
  let canvas: HTMLCanvasElement | undefined;
  try {
    const [origPoints, generatedDetection, o, g] = await Promise.all([
      detectFace(original),
      detectFaceDetailed(generated),
      loadImage(original), loadImage(generated),
    ]);
    const genPoints = generatedDetection.points;
    const width = o.naturalWidth, height = o.naturalHeight;
    // drawImage below normalises the output to the source canvas. Landmarks
    // must be in that same coordinate system before fitting the transform.
    const sameAspect = Math.abs((g.naturalWidth / g.naturalHeight) / (width / height) - 1) <= 0.03;
    const scaledPoints = genPoints?.map(([x, y]): [number, number] =>
      [x * width / g.naturalWidth, y * height / g.naturalHeight]) ?? null;
    let lastDiagnostic: MouthAlignmentDiagnostic = {};
    const emit = (d: MouthAlignmentDiagnostic) => { lastDiagnostic = d; try { report?.({ ...d, ...(generatedDetection.failure ? { generatedFaceFailure: generatedDetection.failure } : {}), sourceWidth: width, sourceHeight: height, generatedWidth: g.naturalWidth, generatedHeight: g.naturalHeight }); } catch { /* QA must never affect delivery. */ } };
    if (!sameAspect) emit({ rejection: "canvas_geometry_invalid", sourceLandmarkCount: origPoints?.length ?? 0, generatedLandmarkCount: genPoints?.length ?? 0 });
    let plan = sameAspect ? planMouthLock(origPoints, scaledPoints, emit) : null;
    const box = (pts: [number, number][], grow: number) => {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const gx = (Math.max(...xs) - Math.min(...xs)) * grow, gy = (Math.max(...ys) - Math.min(...ys)) * grow;
      return { x0: Math.min(...xs) - gx, y0: Math.min(...ys) - gy, x1: Math.max(...xs) + gx, y1: Math.max(...ys) + gy };
    };
    const face = origPoints && origPoints.length >= 468 ? box(origPoints, 0.05) : null;
    const mouthBox = origPoints && origPoints.length >= 468 ? box(pick(origPoints, OUTER_LIP), 0.25) : null;
    if (!plan && sameAspect && origPoints && face && mouthBox) {
      // Landmarks can disagree on a faithful redraw. Compare the face itself,
      // mouth excluded: the same photo at the same framing passes; another
      // person, a reframed image or a mouth close-up does not.
      let probe: HTMLCanvasElement | undefined;
      try {
        probe = document.createElement("canvas"); probe.width = width; probe.height = height;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (pctx) {
          pctx.drawImage(o, 0, 0, width, height); const source = pctx.getImageData(0, 0, width, height).data;
          pctx.drawImage(g, 0, 0, width, height); const drawn = pctx.getImageData(0, 0, width, height).data;
          const match = alignByPixels(source, drawn, width, height, face, mouthBox, Math.max(8, 0.015 * Math.max(width, height)));
          if (pixelMatchAccepted(match)) plan = pixelLockPlan(origPoints, match.dx, match.dy);
        }
      } catch { /* No pixel check available: the landmark rejection stands. */ }
      finally { releaseCanvas(probe); }
    }
    if (plan?.warp && origPoints && face && mouthBox) {
      // Landmarks on a face cut off by the frame (a mouth close-up that still shows the nose) can
      // disagree with a faithful redraw and fit a shift or scale that isn't there, which squeezes the
      // new teeth against the patient's lips. When the face outside the mouth lines up better as it
      // was drawn (allowing a plain shift) than through the fitted warp, the pixels are trusted.
      let probe: HTMLCanvasElement | undefined;
      try {
        probe = document.createElement("canvas"); probe.width = width; probe.height = height;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (pctx) {
          pctx.drawImage(o, 0, 0, width, height); const source = pctx.getImageData(0, 0, width, height).data;
          pctx.clearRect(0, 0, width, height); pctx.drawImage(g, 0, 0, width, height); const drawn = pctx.getImageData(0, 0, width, height).data;
          const { a, b, tx, ty } = plan.transform;
          pctx.clearRect(0, 0, width, height); pctx.setTransform(a, b, -b, a, tx, ty); pctx.drawImage(g, 0, 0, width, height); pctx.setTransform(1, 0, 0, 1, 0, 0);
          const warped = pctx.getImageData(0, 0, width, height).data;
          const asDrawn = alignByPixels(source, drawn, width, height, face, mouthBox, Math.max(8, 0.015 * Math.max(width, height)));
          const throughWarp = alignByPixels(source, warped, width, height, face, mouthBox, 2);
          if (pixelMatchAccepted(asDrawn) && (!throughWarp || asDrawn.meanDifference < throughWarp.meanDifference)) {
            plan = pixelLockPlan(origPoints, asDrawn.dx, asDrawn.dy);
            // The same unreliable landmarks also report "moved" lips, which would clip the new teeth along
            // the landmarks' lip line. Where the lips themselves match the photograph pixel for pixel, the
            // redraw kept them, and the usual softer join applies.
            const lips = lipDifference(source, drawn, width, height, origPoints, asDrawn.dx, asDrawn.dy);
            if (lips !== null && lips <= Math.max(asDrawn.meanDifference * 2, asDrawn.meanDifference + 8)) plan = { ...plan, lipsMoved: false };
          }
        }
      } catch { /* No pixel check available: the landmark plan stands. */ }
      finally { releaseCanvas(probe); }
    }
    if (!plan) return { ...untouched, invalidAlignment: Boolean(origPoints),
      failureReason: origPoints ? "mouth_alignment_rejected" : "mouth_source_landmarks_unavailable" };
    failureReason = "mouth_canvas_unavailable";
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ...untouched, failureReason };

    failureReason = "mouth_composite_failed";
    ctx.drawImage(o, 0, 0, width, height);
    const originalPixels = ctx.getImageData(0, 0, width, height);

    // Where a warp leaves an edge uncovered, the original shows through.
    const { a, b, tx, ty } = plan.transform;
    ctx.setTransform(a, b, -b, a, tx, ty);
    ctx.drawImage(g, 0, 0, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const editedPixels = ctx.getImageData(0, 0, width, height);
    // Landmark geometry alone can fit another person with a similar pose. The
    // aligned face around the mouth must also be this photograph.
    const identity = face && mouthBox ? alignByPixels(originalPixels.data, editedPixels.data, width, height, face, mouthBox, 2) : null;
    // (Too small a face to compare leaves the landmark decision standing.)
    if (identity && !samePhotograph(identity)) return { ...untouched, invalidAlignment: true, failureReason: "mouth_alignment_rejected" };

    const mask = mouthTransitionMask(plan, width, height, options);
    const editableRange = editableRegionRange(editedPixels.data, width, mask);
    emit({ ...lastDiagnostic, ...(editableRange !== null ? { editableRange } : {}) });
    if (editableRange === null || editableRange <= 2) return { ...untouched, failureReason: "mouth_blank_output" };
    const merged = compositeMasked(originalPixels.data, editedPixels.data, width, mask);
    editedPixels.data.set(merged);
    ctx.putImageData(editedPixels, 0, 0);
    failureReason = "mouth_encoding_failed";
    const image = canvas.toDataURL("image/png");
    // Verify the actual encoded result; validation concerns the protected
    // exterior, not the cosmetic or anatomical accuracy of the dental ROI.
    const saved = await loadImage(image);
    ctx.clearRect(0, 0, width, height); ctx.drawImage(saved, 0, 0, width, height);
    const change = measureProtectedRegionChange(originalPixels.data, ctx.getImageData(0, 0, width, height).data, width, mask);
    emit({ ...lastDiagnostic, protectedMeanDifference: change.meanDifference, protectedChangedPixels: change.changedPixels });
    if (change.changedPixels !== 0) return { ...untouched, failureReason: "mouth_protected_region_changed" };
    return {
      // JPEG re-encoding would change protected face pixels after restoration.
      image,
      locked: true,
      lipsMoved: plan.lipsMoved,
      lipsFollowed: Boolean(plan.lipsMoved && options.followLips && lipsCanBeFollowed(plan)),
    };
  } catch {
    return { ...untouched, failureReason };
  } finally {
    releaseCanvas(canvas);
  }
}
