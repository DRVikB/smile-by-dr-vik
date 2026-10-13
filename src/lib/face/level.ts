import type { SmileGuides } from "./guides";

/**
 * Levelling a photograph for viewing: turning it about the point between the eyes until the eye
 * line is horizontal, and enlarging it just enough that no corner of its frame is left uncovered.
 * It changes the view only; the saved photograph is never altered. Pure, so it is tested.
 */
export interface LevelTransform {
  /** How far the eye line slopes as photographed, clockwise positive. The view turns by the opposite. */
  degrees: number;
  scale: number;
  /** The point the photograph turns about, as a share of its width and height. */
  originX: number;
  originY: number;
}

/** Below this the photograph already reads as level; above it something other than a tilt is wrong. */
export const LEVEL_MIN_DEGREES = 0.3;
export const LEVEL_MAX_DEGREES = 20;

export function levelTransform(guides: SmileGuides): LevelTransform | null {
  const { width, height, pupils } = guides;
  const [left, right] = pupils[0][0] <= pupils[1][0] ? pupils : [pupils[1], pupils[0]];
  const tilt = Math.atan2(right[1] - left[1], right[0] - left[0]);
  const degrees = tilt * 180 / Math.PI;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(degrees)) return null;
  if (Math.abs(degrees) < LEVEL_MIN_DEGREES || Math.abs(degrees) > LEVEL_MAX_DEGREES) return null;
  const ox = (left[0] + right[0]) / 2, oy = (left[1] + right[1]) / 2;
  if (ox <= 0 || ox >= width || oy <= 0 || oy >= height) return null;
  // Each corner of the frame shows the photograph's point o + R(tilt)(corner − o) / scale: the scale
  // is the smallest at which all four of those points are still inside the photograph.
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  let scale = 1;
  for (const [cx, cy] of [[0, 0], [width, 0], [0, height], [width, height]]) {
    const dx = cx - ox, dy = cy - oy;
    const vx = dx * cos - dy * sin, vy = dx * sin + dy * cos;
    scale = Math.max(scale, vx > 0 ? vx / (width - ox) : -vx / ox, vy > 0 ? vy / (height - oy) : -vy / oy);
  }
  return { degrees, scale, originX: ox / width, originY: oy / height };
}
