import type { MouthAlignmentDiagnostic, AlignmentRejection } from "./alignmentDiagnostic";
import {
  COMMISSURES,
  INNER_LIP,
  OUTER_LIP,
  STABLE_POINTS,
  applySimilarity,
  distance,
  fitSimilarity,
  IDENTITY_SIMILARITY,
  median,
  pick,
  similarityAngle,
  similarityScale,
  type Point,
  type Similarity,
} from "./geometry";

/**
 * How to put an AI edit back onto the original photograph so that only the
 * mouth can change. Pure: works on landmark positions only.
 */
export interface LockPlan {
  /** Maps generated-image pixels onto original-image pixels. */
  transform: Similarity;
  /** False when the two photos already line up to within landmark noise. */
  warp: boolean;
  /** The edit moved the lips themselves, not just the teeth. */
  lipsMoved: boolean;
  /** The original mouth opening; the lips themselves are never editable. */
  polygon: Point[];
  grow: number;
  feather: number;
}

// Landmark noise on an unchanged face is ~1–3 px; below this share of the
// mouth width, re-warping would add error rather than remove it.
const ALIGN_TOLERANCE = 0.012;
// A teeth-only edit shouldn't move the lip border by more than this share of
// the mouth width.
const LIP_TOLERANCE = 0.04;
// Beyond these the model has reframed the face; don't try to rescue it.
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.18;
const MAX_ANGLE = (8 * Math.PI) / 180;

/** Invalidate reusable results made with the older, lip-inclusive mask. */
export const MOUTH_LOCK_VERSION = "2026-10-03-validated-encoded-mouth-v6";

/** Categorical device QA only; never capture image content or browser errors. */
export const MOUTH_LOCK_FAILURE_CODES = [
  "mouth_image_decode_failed", "mouth_source_landmarks_unavailable",
  "mouth_alignment_rejected", "mouth_canvas_unavailable",
  "mouth_composite_failed", "mouth_encoding_failed", "mouth_protected_region_changed", "mouth_blank_output",
] as const;
export type MouthLockFailure = typeof MOUTH_LOCK_FAILURE_CODES[number];

export function planMouthLock(
  original: Point[] | null,
  generated: Point[] | null,
  report?: (diagnostic: MouthAlignmentDiagnostic) => void,
): LockPlan | null {
  const diagnostic: MouthAlignmentDiagnostic = { sourceLandmarkCount: original?.length ?? 0, generatedLandmarkCount: generated?.length ?? 0 };
  const emit = () => { try { report?.({ ...diagnostic }); } catch { /* QA must never change protection. */ } };
  const reject = (rejection: AlignmentRejection) => { diagnostic.rejection = rejection; emit(); return null; };
  // A mask is not evidence that the returned image is a full-face edit. In
  // particular, never paste a provider's mouth close-up into a face using an
  // identity transform simply because no face could be found in that output.
  const valid = (points: Point[]) => points.length >= 468 && points.every(p => p.length === 2 && p.every(Number.isFinite));
  if (!original) return reject("source_landmarks_missing");
  if (!valid(original)) return reject("source_landmarks_invalid");
  if (!generated) return reject("generated_landmarks_missing");
  if (!valid(generated)) return reject("generated_landmarks_invalid");
  const [left, right] = pick(original, COMMISSURES);
  const mouthWidth = distance(left, right);
  diagnostic.sourceMouthWidth = mouthWidth;
  diagnostic.generatedMouthWidth = distance(...pick(generated, COMMISSURES) as [Point, Point]);
  if (!(mouthWidth >= 20)) return reject("mouth_width_insufficient");
  diagnostic.fittedScale = 1; diagnostic.fittedRotationDegrees = 0;

  let transform = IDENTITY_SIMILARITY;
  let warp = false;
  let lipsMoved = false;
  if (generated && generated.length >= 468) {
    // Lip corners may have moved in the AI output, so never align using them.
    const anchors = [...STABLE_POINTS];
    const from = pick(generated, anchors);
    const to = pick(original, anchors);
    const residual = median(from.map((p, i) => distance(p, to[i])));
    if (residual > ALIGN_TOLERANCE * mouthWidth) {
      const fitted = fitSimilarity(from, to);
      const scale = similarityScale(fitted);
      diagnostic.fittedScale = scale;
      diagnostic.fittedRotationDegrees = similarityAngle(fitted) * 180 / Math.PI;
      if (scale < MIN_SCALE || scale > MAX_SCALE) return reject("similarity_scale_out_of_range");
      if (Math.abs(similarityAngle(fitted)) > MAX_ANGLE) return reject("similarity_rotation_out_of_range");
      transform = fitted;
      warp = true;
    }
    // A least-squares fit can still return a plausible scale for unrelated or
    // distorted faces. Check the aligned anchors, not just the transform.
    const alignedResiduals = from.map((p, i) => distance(applySimilarity(transform, p), to[i]));
    diagnostic.medianResidual = median(alignedResiduals);
    diagnostic.allowedResidual = Math.max(3, 0.04 * mouthWidth);
    diagnostic.anchorOutlierCount = alignedResiduals.filter(d => d > Math.max(6, 0.1 * mouthWidth)).length;
    diagnostic.allowedOutlierCount = 1;
    if (diagnostic.medianResidual > diagnostic.allowedResidual) return reject("anchor_residual_excessive");
    if (diagnostic.anchorOutlierCount > diagnostic.allowedOutlierCount) return reject("anchor_outliers_excessive");
    const genLips = pick(generated, OUTER_LIP).map((p) => applySimilarity(transform, p));
    const origLips = pick(original, OUTER_LIP);
    lipsMoved =
      median(genLips.map((p, i) => distance(p, origLips[i]))) >
      LIP_TOLERANCE * mouthWidth ||
      median(pick(generated, INNER_LIP).map((p, i) => distance(applySimilarity(transform, p), original[INNER_LIP[i]]))) > LIP_TOLERANCE * mouthWidth;
  }

  emit();
  return {
    transform,
    warp,
    lipsMoved,
    polygon: pick(original, INNER_LIP),
    grow: 0,
    feather: Math.max(1, 0.005 * mouthWidth),
  };
}
