import type { MouthAlignmentDiagnostic } from "./alignmentDiagnostic";
import { compositeMasked, measureProtectedRegionChange, editableRegionRange } from "./geometry";
import { detectFace, detectFaceDetailed } from "./landmarks";
import { planMouthLock, mouthTransitionMask, type MouthLockFailure } from "./lock";

export interface MouthLockResult {
  image: string;
  /** True when the source outer-lip contour and surrounding face are restored. */
  locked: boolean;
  lipsMoved: boolean;
  /** The source has a face but the returned image cannot be aligned to it. */
  invalidAlignment?: boolean;
  failureReason?: MouthLockFailure;
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
): Promise<MouthLockResult> {
  const untouched = { image: generated, locked: false, lipsMoved: false };
  let failureReason: MouthLockFailure = "mouth_image_decode_failed";
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
    const plan = sameAspect ? planMouthLock(origPoints, scaledPoints, emit) : null;
    if (!plan) return { ...untouched, invalidAlignment: Boolean(origPoints),
      failureReason: origPoints ? "mouth_alignment_rejected" : "mouth_source_landmarks_unavailable" };
    failureReason = "mouth_canvas_unavailable";
    const canvas = document.createElement("canvas");
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

    const mask = mouthTransitionMask(plan, width, height);
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
    };
  } catch {
    return { ...untouched, failureReason };
  }
}
