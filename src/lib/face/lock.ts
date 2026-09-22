import {
  COMMISSURES,
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
  /** The original's outer lip border — the only region the edit may touch. */
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

export function planMouthLock(
  original: Point[] | null,
  generated: Point[] | null,
): LockPlan | null {
  if (!original || original.length < 468) return null;
  const [left, right] = pick(original, COMMISSURES);
  const mouthWidth = distance(left, right);
  if (!(mouthWidth >= 20)) return null;

  let transform = IDENTITY_SIMILARITY;
  let warp = false;
  let lipsMoved = false;
  if (generated && generated.length >= 468) {
    const anchors = [...STABLE_POINTS, ...COMMISSURES];
    const from = pick(generated, anchors);
    const to = pick(original, anchors);
    const residual = median(from.map((p, i) => distance(p, to[i])));
    if (residual > ALIGN_TOLERANCE * mouthWidth) {
      const fitted = fitSimilarity(from, to);
      const scale = similarityScale(fitted);
      if (
        scale < MIN_SCALE ||
        scale > MAX_SCALE ||
        Math.abs(similarityAngle(fitted)) > MAX_ANGLE
      )
        return null;
      transform = fitted;
      warp = true;
    }
    const genLips = pick(generated, OUTER_LIP).map((p) => applySimilarity(transform, p));
    const origLips = pick(original, OUTER_LIP);
    lipsMoved =
      median(genLips.map((p, i) => distance(p, origLips[i]))) >
      LIP_TOLERANCE * mouthWidth;
  }

  return {
    transform,
    warp,
    lipsMoved,
    polygon: pick(original, OUTER_LIP),
    grow: Math.max(2, 0.015 * mouthWidth),
    feather: Math.max(4, 0.05 * mouthWidth),
  };
}
