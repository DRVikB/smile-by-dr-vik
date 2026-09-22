/**
 * Pure geometry for the face-lock and smile-analysis features. Nothing here
 * touches the DOM, so all of it runs (and is tested) in Node.
 *
 * Landmark indices follow MediaPipe's 478-point face mesh (468 mesh points
 * plus 10 iris points).
 */

export type Point = [number, number];

/** Outer lip border, as a closed loop (vermilion edge of both lips). */
export const OUTER_LIP = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0,
  37, 39, 40, 185,
] as const;

/**
 * Upper edge of the lower lip, commissure to commissure — the curve the
 * upper incisal edges are usually designed to follow (the smile arc).
 * MediaPipe's inner-lip points sit a little inside the true lip edge, so this
 * is a reference line, not a measurement.
 */
export const LOWER_LIP_CURVE = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
] as const;

/**
 * Points a teeth-only edit should never move: eye corners, the nose and the
 * face outline at the cheeks. Used to tell whether the generated photo has
 * shifted or rescaled relative to the original.
 */
export const STABLE_POINTS = [33, 133, 362, 263, 168, 6, 1, 4, 234, 454] as const;

export const COMMISSURES = [61, 291] as const;
export const GLABELLA = 168;
export const CHIN = 152;
/** Iris centres (patient's right, patient's left) and their ring points. */
export const IRIS_RIGHT = { centre: 468, ring: [469, 470, 471, 472] } as const;
export const IRIS_LEFT = { centre: 473, ring: [474, 475, 476, 477] } as const;

export function pick(points: readonly Point[], indices: readonly number[]): Point[] {
  return indices.map((i) => points[i]);
}

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A 2D similarity transform: x' = a·x − b·y + tx, y' = b·x + a·y + ty. */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY_SIMILARITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };

export function applySimilarity(t: Similarity, p: Point): Point {
  return [t.a * p[0] - t.b * p[1] + t.tx, t.b * p[0] + t.a * p[1] + t.ty];
}

export const similarityScale = (t: Similarity) => Math.hypot(t.a, t.b);
export const similarityAngle = (t: Similarity) => Math.atan2(t.b, t.a);

/**
 * Least-squares similarity (rotation, uniform scale, translation) that maps
 * `from` onto `to`. Closed form — no iteration, no rank problems for the
 * handful of well-spread points this is used with.
 */
export function fitSimilarity(from: Point[], to: Point[]): Similarity {
  const n = Math.min(from.length, to.length);
  if (n < 2) return IDENTITY_SIMILARITY;
  let fx = 0, fy = 0, gx = 0, gy = 0;
  for (let i = 0; i < n; i++) {
    fx += from[i][0]; fy += from[i][1];
    gx += to[i][0]; gy += to[i][1];
  }
  fx /= n; fy /= n; gx /= n; gy /= n;
  let sxx = 0, sab = 0, sba = 0;
  for (let i = 0; i < n; i++) {
    const x = from[i][0] - fx, y = from[i][1] - fy;
    const u = to[i][0] - gx, v = to[i][1] - gy;
    sxx += x * x + y * y;
    sab += x * u + y * v;
    sba += x * v - y * u;
  }
  if (sxx === 0) return IDENTITY_SIMILARITY;
  const a = sab / sxx;
  const b = sba / sxx;
  return { a, b, tx: gx - (a * fx - b * fy), ty: gy - (b * fx + a * fy) };
}

/** Shortest distance from a point to a line segment. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export interface Mask {
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** 0–1 per pixel of the box, row-major: how much of the edit to keep. */
  alpha: Float32Array;
}

/**
 * A soft mask for a closed polygon: fully on inside it and for `grow` pixels
 * beyond its edge, then falling smoothly to zero over `feather` pixels. The
 * soft edge lands on skin just outside the lips, where the original and the
 * edit already agree, so the join cannot be seen.
 */
export function polygonMask(
  poly: Point[],
  imageWidth: number,
  imageHeight: number,
  grow: number,
  feather: number,
): Mask {
  const reach = grow + feather;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - reach));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - reach));
  const x1 = Math.min(imageWidth, Math.ceil(Math.max(...xs) + reach));
  const y1 = Math.min(imageHeight, Math.ceil(Math.max(...ys) + reach));
  const width = Math.max(0, x1 - x0), height = Math.max(0, y1 - y0);
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p: Point = [x0 + x + 0.5, y0 + y + 0.5];
      let value: number;
      if (pointInPolygon(p, poly)) value = 1;
      else {
        let d = Infinity;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
          d = Math.min(d, segmentDistance(p, poly[j], poly[i]));
        if (d <= grow) value = 1;
        else if (d >= reach || feather <= 0) value = 0;
        else {
          // Smoothstep, so the fall-off has no visible band at either end.
          const t = 1 - (d - grow) / feather;
          value = t * t * (3 - 2 * t);
        }
      }
      alpha[y * width + x] = value;
    }
  }
  return { x0, y0, width, height, alpha };
}

/**
 * Keep the original photograph everywhere, and take the edit only where the
 * mask allows. Both buffers are RGBA at the same size; returns a new buffer.
 */
export function compositeMasked(
  original: Uint8ClampedArray,
  edited: Uint8ClampedArray,
  imageWidth: number,
  mask: Mask,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(original);
  for (let y = 0; y < mask.height; y++) {
    const row = (mask.y0 + y) * imageWidth;
    for (let x = 0; x < mask.width; x++) {
      const a = mask.alpha[y * mask.width + x];
      if (a <= 0) continue;
      const i = (row + mask.x0 + x) * 4;
      out[i] = original[i] + (edited[i] - original[i]) * a;
      out[i + 1] = original[i + 1] + (edited[i + 1] - original[i + 1]) * a;
      out[i + 2] = original[i + 2] + (edited[i + 2] - original[i + 2]) * a;
    }
  }
  return out;
}
