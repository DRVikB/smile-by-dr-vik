import type { Photo, SmileSettings } from "./types";
import { releaseCanvas } from "./canvasMemory";
import { INNER_LIP, pick, type Point } from "./face/geometry";
import { fillPolygon } from "./toothMap/segment";
import { photoFingerprint, type ToothMap } from "./toothMap/types";
import { rgbToLab, toothWeights, whiteningPlan, whitenPixels } from "./whitening";

/** Results made by this method; bump to stop reusing older on-device results. */
export const ON_DEVICE_WHITENING_VERSION = "on-device-whitening-v2";

/** Colour-only whitening is rendered on the device; every other treatment uses the image service. */
export function isOnDeviceWhitening(settings: SmileSettings): boolean {
  return settings.treatment === "Whitening" && !settings.alignment && settings.treatmentMode !== "full_arch";
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo could not be opened."));
    image.src = src;
  });
}

export interface OnDeviceWhitening { image: string; teethPixels: number }

/**
 * A close-up's whitening area as a band that follows the detected teeth column by column: from
 * the teeth's top edge (less a small margin) down past their biting edges to the lower lip,
 * reaching a little beyond the outermost teeth and bridging gaps between them. A plain rectangle
 * takes in skin where the smile curves up towards the corners; the band follows the curve. Within
 * `region` only. Exported for tests.
 */
export function closeUpOpening(rgba: Uint8ClampedArray, W: number, H: number, region: Uint8Array, teeth: Uint8Array[]): Uint8Array {
  const top = new Float64Array(W).fill(-1), bottom = new Float64Array(W).fill(-1);
  for (const tooth of teeth) for (let i = 0; i < W * H; i++) if (tooth[i]) {
    const x = i % W, y = (i - x) / W;
    if (top[x] < 0 || y < top[x]) top[x] = y;
    if (y > bottom[x]) bottom[x] = y;
  }
  const xs = [...top.keys()].filter(x => top[x] >= 0);
  const out = new Uint8Array(W * H);
  if (!xs.length) return out;
  const x0 = xs[0], x1 = xs[xs.length - 1], margin = Math.round((x1 - x0) * 0.05);
  // Bridge gaps between teeth by joining neighbouring measured columns.
  for (let k = 1; k < xs.length; k++) for (let x = xs[k - 1] + 1; x < xs[k]; x++) {
    const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1]);
    top[x] = top[xs[k - 1]] * (1 - t) + top[xs[k]] * t;
    bottom[x] = bottom[xs[k - 1]] * (1 - t) + bottom[xs[k]] * t;
  }
  // Detected outlines can be short or blocky: each column takes the highest top and lowest edge
  // nearby, so a whole tooth is covered rather than stripes of it.
  const reach = Math.max(1, Math.round((x1 - x0) * 0.04)), rawTop = top.slice(), rawBottom = bottom.slice();
  for (let x = x0; x <= x1; x++) {
    let t = rawTop[x], b = rawBottom[x];
    for (let k = Math.max(x0, x - reach); k <= Math.min(x1, x + reach); k++) { t = Math.min(t, rawTop[k]); b = Math.max(b, rawBottom[k]); }
    top[x] = t; bottom[x] = b;
  }
  const heights = xs.map(x => rawBottom[x] - rawTop[x]).sort((a, b) => a - b), th = heights[Math.floor(heights.length / 2)];
  const lip = (x: number, y: number) => {
    const p = (y * W + x) * 4;
    const [, a, b] = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    return a - 0.6 * Math.max(0, b) > 12;
  };
  for (let x = Math.max(0, x0 - margin); x <= Math.min(W - 1, x1 + margin); x++) {
    const ref = x < x0 ? x0 : x > x1 ? x1 : x;
    const from = Math.max(0, Math.round(top[ref] - th * 0.06)), edge = Math.round(bottom[ref]);
    // Down past the biting edge to the first run of lip, for the lower teeth.
    let to = Math.min(H - 1, Math.round(edge + th * 0.8)), reds = 0;
    for (let y = edge; y <= to; y++) { reds = lip(x, y) ? reds + 1 : 0; if (reds >= 3) { to = y - 3; break; } }
    for (let y = from; y <= to; y++) if (region[y * W + x]) out[y * W + x] = 1;
  }
  return out;
}

/**
 * Whiten every visible tooth, upper and lower, as whitening treats both
 * arches. `points` are the photo's face landmarks (in pixels): the inner lip
 * bounds the edit. A close-up without a face uses the detected teeth instead.
 */
export async function whitenOnDevice(photo: Pick<Photo, "dataUrl" | "editMask">, settings: SmileSettings, points: Point[] | null, map?: ToothMap | null): Promise<OnDeviceWhitening> {
  const image = await load(photo.dataUrl);
  const W = image.naturalWidth, H = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This device could not prepare the photo.");
  ctx.drawImage(image, 0, 0);
  const original = ctx.getImageData(0, 0, W, H);

  const usableMap = map && map.photoId === photoFingerprint(photo.dataUrl) ? map : null;
  const opening = points && points.length >= 468 ? pick(points, INNER_LIP)
    : usableMap?.mouthOpening && usableMap.mouthOpening.length >= 3 ? usableMap.mouthOpening.map(([x, y]) => [x * W, y * H] as Point) : null;
  let region: Uint8Array;
  if (opening) region = fillPolygon(opening, W, H);
  else {
    // A close-up without a face: the detected upper teeth, extended down to the
    // lower arch. Lips and gums inside it are left out by colour.
    const pts = usableMap?.teeth.filter(t => t.visible).flatMap(t => t.outline) ?? [];
    if (!pts.length) throw new Error("The teeth could not be found in this photo. Try a clearer, front-facing smile.");
    const xs = pts.map(p => p[0] * W), ys = pts.map(p => p[1] * H);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), mx = (x1 - x0) * 0.15, th = y1 - y0;
    // Stop at the lower lip: the first row below the teeth that is mostly red.
    let bottom = Math.min(H - 1, Math.round(y1 + th * 0.8));
    for (let y = Math.round(y1); y <= bottom; y++) {
      let red = 0, n = 0;
      for (let x = Math.max(0, Math.round(x0)); x <= Math.min(W - 1, Math.round(x1)); x += 2) {
        const p = (y * W + x) * 4;
        const [, a, b] = rgbToLab(original.data[p], original.data[p + 1], original.data[p + 2]);
        n++; if (a - 0.6 * Math.max(0, b) > 12) red++;
      }
      if (n && red / n > 0.6) { bottom = y; break; }
    }
    region = fillPolygon([[x0 - mx, y0 - th * 0.1], [x1 + mx, y0 - th * 0.1], [x1 + mx, bottom], [x0 - mx, bottom]], W, H);
    // The rectangle's corners reach past the lips onto the cheeks, where pale skin can pass for a
    // tooth. Keep only what can be reached from the detected teeth without crossing the lips.
    region = closeUpOpening(original.data, W, H, region, usableMap!.teeth.filter(t => t.visible).map(t => fillPolygon(t.outline.map(([x, y]) => [x * W, y * H] as Point), W, H)));
  }
  if (photo.editMask) {
    // A painted edit area narrows the change further.
    const mask = await load(photo.editMask);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(mask, 0, 0, W, H);
    const painted = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0, p = 0; i < region.length; i++, p += 4) if (painted[p + 3] < 128 || painted[p] < 128) region[i] = 0;
  }

  const { weights, teethPixels } = toothWeights(original.data, W, H, region);
  if (teethPixels < 50) throw new Error("The teeth could not be found in this photo. Try a clearer, front-facing smile.");
  const plan = whiteningPlan(original.data, weights, settings.targetShade, settings.intensity);
  const out = ctx.createImageData(W, H);
  out.data.set(plan ? whitenPixels(original.data, weights, plan) : original.data);
  ctx.putImageData(out, 0, 0);
  const whitened = canvas.toDataURL("image/jpeg", 0.95);
  releaseCanvas(canvas);
  return { image: whitened, teethPixels };
}
