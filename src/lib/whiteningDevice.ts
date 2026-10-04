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
