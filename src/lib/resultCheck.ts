import type { Framing } from "./types";

/**
 * A local, advisory check that a generated preview didn't grow past the
 * capture guide by more than a reasonable margin. It only runs when the
 * photo carries a `framing` (i.e. it was captured against the on-screen
 * guide), since that's the only case where there is a trustworthy anchor
 * to measure against — an uploaded photo has no such reference, and this
 * intentionally returns null rather than guess.
 */

export interface ScaleAssessment {
  flag: "ok" | "grew";
  /** Width of the changed region as a multiple of the guide box's width. */
  changedWidthRatio: number;
  /**
   * Height of the changed region as a multiple of the guide box's height.
   * Tracked separately from width because over-lengthening (edges pushed
   * down towards the lower lip) doesn't reliably widen the changed region
   * the way over-widening does — a tooth can grow taller without growing
   * much wider at all, and width alone would miss it.
   */
  changedHeightRatio: number;
}

// A weighted grayscale difference above this counts as "changed" — well
// above normal JPEG re-encoding noise, comfortably below a real edit.
const DIFF_THRESHOLD = 28;
// A column only counts towards the changed region if at least this share of
// its sampled pixels changed, so a handful of stray noisy pixels can never
// widen the measured region on their own.
const COLUMN_SHARE = 0.04;
const MIN_COLUMN_COUNT = 3;
// The changed region may be up to this many times wider than the guide box
// before the result is flagged — camera and guide alignment are never
// pixel-perfect, so some slack is expected even from a well-behaved edit.
const GROWTH_TOLERANCE = 1.35;
// Below this many changed pixels there isn't enough signal to measure
// reliably (e.g. a very low-intensity, mostly-shade-only edit).
const MIN_CHANGED_PIXELS = 40;
// How far beyond the guide box, in multiples of its own size, to look —
// wide enough to catch real growth without scanning the whole photograph.
const SEARCH_MARGIN = 0.6;

export function assessResultScale(
  original: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  width: number,
  height: number,
  framing: Framing | undefined,
): ScaleAssessment | null {
  if (!framing) return null;
  if (
    original.length !== generated.length ||
    original.length < width * height * 4
  )
    return null;

  const gx0 = Math.max(
    0,
    Math.floor((framing.x - framing.width * SEARCH_MARGIN) * width),
  );
  const gx1 = Math.min(
    width,
    Math.ceil((framing.x + framing.width * (1 + SEARCH_MARGIN)) * width),
  );
  const gy0 = Math.max(
    0,
    Math.floor((framing.y - framing.height * SEARCH_MARGIN) * height),
  );
  const gy1 = Math.min(
    height,
    Math.ceil((framing.y + framing.height * (1 + SEARCH_MARGIN)) * height),
  );
  const regionWidth = gx1 - gx0;
  const regionHeight = gy1 - gy0;
  if (regionWidth <= 0 || regionHeight <= 0) return null;

  const columnCounts = new Uint32Array(regionWidth);
  const rowCounts = new Uint32Array(regionHeight);
  let totalChanged = 0;
  for (let y = gy0; y < gy1; y++) {
    const rowBase = y * width;
    for (let x = gx0; x < gx1; x++) {
      const i = (rowBase + x) * 4;
      const dr = original[i] - generated[i];
      const dg = original[i + 1] - generated[i + 1];
      const db = original[i + 2] - generated[i + 2];
      const diff =
        0.299 * Math.abs(dr) + 0.587 * Math.abs(dg) + 0.114 * Math.abs(db);
      if (diff > DIFF_THRESHOLD) {
        columnCounts[x - gx0]++;
        rowCounts[y - gy0]++;
        totalChanged++;
      }
    }
  }
  if (totalChanged < MIN_CHANGED_PIXELS)
    return { flag: "ok", changedWidthRatio: 0, changedHeightRatio: 0 };

  const columnThreshold = Math.max(
    MIN_COLUMN_COUNT,
    regionHeight * COLUMN_SHARE,
  );
  let minCol = -1;
  let maxCol = -1;
  for (let c = 0; c < regionWidth; c++) {
    if (columnCounts[c] >= columnThreshold) {
      if (minCol === -1) minCol = c;
      maxCol = c;
    }
  }

  // Same idea, rotated 90 degrees: a row only counts towards the changed
  // region if enough of its sampled pixels (across the region's width)
  // changed, so this catches genuine vertical growth (teeth lengthened
  // towards the lower lip) rather than a few stray changed rows.
  const rowThreshold = Math.max(MIN_COLUMN_COUNT, regionWidth * COLUMN_SHARE);
  let minRow = -1;
  let maxRow = -1;
  for (let r = 0; r < regionHeight; r++) {
    if (rowCounts[r] >= rowThreshold) {
      if (minRow === -1) minRow = r;
      maxRow = r;
    }
  }

  if (minCol === -1 && minRow === -1)
    return { flag: "ok", changedWidthRatio: 0, changedHeightRatio: 0 };

  const expectedWidth = framing.width * width;
  const expectedHeight = framing.height * height;
  const changedWidthRatio =
    minCol === -1 || expectedWidth <= 0
      ? 0
      : (maxCol - minCol + 1) / expectedWidth;
  const changedHeightRatio =
    minRow === -1 || expectedHeight <= 0
      ? 0
      : (maxRow - minRow + 1) / expectedHeight;
  return {
    flag:
      changedWidthRatio > GROWTH_TOLERANCE ||
      changedHeightRatio > GROWTH_TOLERANCE
        ? "grew"
        : "ok",
    changedWidthRatio,
    changedHeightRatio,
  };
}

/** Decode two data URLs and run `assessResultScale` on their pixels. */
export async function assessResultScaleFromDataUrls(
  originalDataUrl: string,
  generatedDataUrl: string,
  framing: Framing | undefined,
): Promise<ScaleAssessment | null> {
  if (!framing) return null;
  try {
    const [a, b] = await Promise.all([
      decode(originalDataUrl),
      decode(generatedDataUrl),
    ]);
    if (a.width !== b.width || a.height !== b.height) return null;
    return assessResultScale(a.data, b.data, a.width, a.height, framing);
  } catch {
    return null;
  }
}

async function decode(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
