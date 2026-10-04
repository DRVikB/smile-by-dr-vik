/**
 * Pixel check for masked edits. An image service that edits the supplied
 * canvas keeps its framing, but a faithful redraw can still move landmark
 * estimates by more than the landmark tolerance. Here the face around the
 * mouth (the mouth itself excluded) is compared directly, allowing a small
 * shift. A different person, a reframed photo or a mouth close-up fails.
 */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface PixelAlignment { dx: number; dy: number; correlation: number; meanDifference: number }

/** Accept only a close match: same photo, same framing. */
export const MIN_CORRELATION = 0.9;
export const MAX_MEAN_DIFFERENCE = 12;

function luma(px: Uint8ClampedArray, i: number): number {
  return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
}

function score(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, face: Box, mouth: Box, dx: number, dy: number, step: number) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, sad = 0;
  for (let y = face.y0; y < face.y1; y += step) {
    const yb = y - dy;
    if (yb < 0 || yb >= height) continue;
    for (let x = face.x0; x < face.x1; x += step) {
      if (x >= mouth.x0 && x < mouth.x1 && y >= mouth.y0 && y < mouth.y1) continue;
      const xb = x - dx;
      if (xb < 0 || xb >= width) continue;
      const va = luma(a, (y * width + x) * 4), vb = luma(b, (yb * width + xb) * 4);
      n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; sad += Math.abs(va - vb);
    }
  }
  if (n < 100) return null;
  const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return { correlation: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0, meanDifference: sad / n };
}

/**
 * The shift (generated → original, in pixels) that best matches the face
 * outside the mouth, and how well it matches. `b` must already be drawn at the
 * original's size. Coarse search first, then a fine search around the best.
 */
export function alignByPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, face: Box, mouth: Box, maxShift: number): PixelAlignment | null {
  const clip = (box: Box): Box => ({ x0: Math.max(0, Math.floor(box.x0)), y0: Math.max(0, Math.floor(box.y0)), x1: Math.min(width, Math.ceil(box.x1)), y1: Math.min(height, Math.ceil(box.y1)) });
  const f = clip(face), m = clip(mouth);
  const coarse = Math.max(1, Math.round((f.x1 - f.x0) / 200));
  let best = { dx: 0, dy: 0, meanDifference: Infinity };
  const R = Math.ceil(maxShift / coarse) * coarse;
  for (let dy = -R; dy <= R; dy += coarse) for (let dx = -R; dx <= R; dx += coarse) {
    const s = score(a, b, width, height, f, m, dx, dy, coarse * 2);
    if (s && s.meanDifference < best.meanDifference) best = { dx, dy, meanDifference: s.meanDifference };
  }
  if (!Number.isFinite(best.meanDifference)) return null;
  const fineStep = Math.max(1, Math.round(coarse / 2));
  let fine = best;
  for (let dy = best.dy - coarse; dy <= best.dy + coarse; dy++) for (let dx = best.dx - coarse; dx <= best.dx + coarse; dx++) {
    const s = score(a, b, width, height, f, m, dx, dy, fineStep * 2);
    if (s && s.meanDifference < fine.meanDifference) fine = { dx, dy, meanDifference: s.meanDifference };
  }
  const final = score(a, b, width, height, f, m, fine.dx, fine.dy, fineStep);
  return final ? { dx: fine.dx, dy: fine.dy, ...final } : null;
}

export function pixelMatchAccepted(match: PixelAlignment | null): match is PixelAlignment {
  return Boolean(match && match.correlation >= MIN_CORRELATION && match.meanDifference <= MAX_MEAN_DIFFERENCE);
}

/** After alignment, the face around the mouth must still be this photograph
 * (another person scores about 0.6 or less; a faithful edit about 0.99). */
export const MIN_IDENTITY_CORRELATION = 0.8;
export const MAX_IDENTITY_DIFFERENCE = 25;
export function samePhotograph(match: PixelAlignment | null): boolean {
  return Boolean(match && match.correlation >= MIN_IDENTITY_CORRELATION && match.meanDifference <= MAX_IDENTITY_DIFFERENCE);
}
