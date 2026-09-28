import type { Framing } from "./types";

// Shared by request preparation and Gemini, so provider rounding cannot turn a
// supported upload into a charged result that the comparison cannot align.
const ASPECT_RATIOS = [
  [21, 9], [16, 9], [3, 2], [4, 3], [5, 4], [1, 1],
  [4, 5], [3, 4], [2, 3], [9, 16],
] as const;

function nearestRatio(width: number, height: number) {
  const target = Math.log(width / height);
  return ASPECT_RATIOS.reduce((best, ratio) =>
    Math.abs(Math.log(ratio[0] / ratio[1]) - target) <
    Math.abs(Math.log(best[0] / best[1]) - target) ? ratio : best);
}

export function nearestAspectRatio(width: number, height: number): string {
  return nearestRatio(width, height).join(":");
}

/** Add a border to the request canvas; never crop or distort the patient photo. */
export function generationCanvas(width: number, height: number): {
  width: number; height: number; sourceBounds: Framing;
} {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0))
    throw new Error("The photograph must have valid positive pixel dimensions.");
  const [rw, rh] = nearestRatio(width, height);
  const units = Math.ceil(Math.max(width / rw, height / rh));
  const canvasWidth = rw * units, canvasHeight = rh * units;
  const scale = Math.min(1, 2048 / Math.max(canvasWidth, canvasHeight));
  const outWidth = Math.round(canvasWidth * scale), outHeight = Math.round(canvasHeight * scale);
  const sourceWidth = Math.max(1, Math.round(width * scale)), sourceHeight = Math.max(1, Math.round(height * scale));
  return {
    width: outWidth, height: outHeight,
    sourceBounds: {
      x: Math.floor((outWidth - sourceWidth) / 2) / outWidth,
      y: Math.floor((outHeight - sourceHeight) / 2) / outHeight,
      width: sourceWidth / outWidth, height: sourceHeight / outHeight,
    },
  };
}

export function frameWithinCanvas(frame: Framing, source: Framing): Framing {
  return { x: source.x + frame.x * source.width, y: source.y + frame.y * source.height,
    width: frame.width * source.width, height: frame.height * source.height };
}
