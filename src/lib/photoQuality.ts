/**
 * A quick, local read on whether a patient photo is sharp and well lit
 * enough for the AI edit to work from. The model amplifies whatever it is
 * given, so a soft or badly exposed source photo reliably produces a soft
 * or badly exposed — and less trustworthy — result. This never blocks the
 * clinician; it just surfaces an honest heads-up before they generate.
 */

export interface PhotoQuality {
  blurry: boolean;
  tooDark: boolean;
  tooBright: boolean;
  sharpness: number;
  brightness: number;
}

// Tuned against the same brightness band CameraSheet's live light meter
// already uses, so the advice a clinician gets while framing a shot and the
// advice they get after picking a file agree with each other.
const DARK_THRESHOLD = 60;
const BRIGHT_THRESHOLD = 215;
// Below this, a Laplacian-variance sharpness score reads as visibly soft on
// a downsampled photo. Calibrated empirically, not a physical unit.
const BLUR_THRESHOLD = 45;

/** Perceptual luminance, matching the weighting used elsewhere in the app. */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Variance of a Laplacian (edge) filter over the luminance channel. A sharp
 * photo has strong edges and high variance; a blurred one is smooth and
 * scores low. Operates on already-downsampled pixels so it stays cheap.
 */
export function sharpnessScore(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return Infinity; // too small to judge; don't flag
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    gray[i] = luminance(pixels[p], pixels[p + 1], pixels[p + 2]);
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * gray[i] -
        gray[i - 1] -
        gray[i + 1] -
        gray[i - width] -
        gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return Infinity;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** Mean perceptual brightness across the sampled pixels, 0-255. */
export function brightnessScore(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  let total = 0;
  const count = width * height;
  if (count === 0) return 128;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    total += luminance(pixels[p], pixels[p + 1], pixels[p + 2]);
  }
  return total / count;
}

export function assessPhotoQuality(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PhotoQuality {
  const sharpness = sharpnessScore(pixels, width, height);
  const brightness = brightnessScore(pixels, width, height);
  return {
    blurry: sharpness < BLUR_THRESHOLD,
    tooDark: brightness < DARK_THRESHOLD,
    tooBright: brightness > BRIGHT_THRESHOLD,
    sharpness,
    brightness,
  };
}
