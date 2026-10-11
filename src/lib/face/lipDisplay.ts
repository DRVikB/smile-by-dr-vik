import type { Point } from "./geometry";

/** Below this lip gap (centre of the inner lips, as a share of the mouth width) little of the teeth shows. */
export const NARROW_LIP_GAP = 0.2;

/**
 * How open the smile is in the photo, from face landmarks: the gap between the inner lips at the
 * centre (13, 14) against the distance between the mouth corners (61, 291).
 */
export function lipGapRatio(points: Point[]): number | null {
  const [top, bottom, left, right] = [points[13], points[14], points[61], points[291]];
  if (!top || !bottom || !left || !right) return null;
  const width = Math.hypot(right[0] - left[0], right[1] - left[1]);
  if (!(width > 0)) return null;
  return Math.hypot(bottom[0] - top[0], bottom[1] - top[1]) / width;
}

export function lipDisplay(points: Point[] | null | undefined): "narrow" | "open" | undefined {
  const ratio = points ? lipGapRatio(points) : null;
  return ratio === null ? undefined : ratio < NARROW_LIP_GAP ? "narrow" : "open";
}
