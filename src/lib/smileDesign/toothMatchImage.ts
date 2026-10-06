import type { Photo } from "../types";
import { releaseCanvas } from "../canvasMemory";
import { INNER_LIP, pick, type Point } from "../face/geometry";
import { fillPolygon } from "../toothMap/segment";
import { newGuide, type SmileGuide } from "./frame";
import { keepToothRegion, toothRegion, type ToothMatch } from "./toothMatch";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo could not be opened."));
    image.src = src;
  });
}

/** The guide (saved in the photo's pixels) scaled to another size of the same image. */
function scaled(g: SmileGuide, sx: number, sy: number): SmileGuide {
  if (sx === 1 && sy === 1) return g;
  const fit = { cx: g.fit.cx * sx, cy: g.fit.cy * sy, halfWidth: g.fit.halfWidth * sx, angle: Math.atan2(Math.sin(g.fit.angle) * sy, Math.cos(g.fit.angle) * sx) };
  return { ...newGuide(fit, g.shape), width: g.width, length: g.length, curve: g.curve, dx: g.dx, dy: g.dy };
}

/**
 * The guidance mask sent with a one-tooth request: white over the tooth's
 * region, black elsewhere, on the request canvas (the photo sits at
 * `sourceBounds`, as fractions of it). Lips are left out when `points` are known.
 */
export function toothMatchMask(photo: Pick<Photo, "width" | "height">, guide: SmileGuide, match: ToothMatch, points: Point[] | null,
  canvas: { width: number; height: number }, sourceBounds: { x: number; y: number; width: number; height: number }): string | undefined {
  const W = canvas.width, H = canvas.height;
  const sx = (sourceBounds.width * W) / photo.width, sy = (sourceBounds.height * H) / photo.height;
  const ox = sourceBounds.x * W, oy = sourceBounds.y * H;
  const g = scaled(guide, sx, sy);
  const shifted: SmileGuide = { ...g, fit: { ...g.fit, cx: g.fit.cx + ox, cy: g.fit.cy + oy } };
  const opening = points && points.length >= 468 ? fillPolygon(pick(points, INNER_LIP).map(([x, y]) => [x * sx + ox, y * sy + oy] as Point), W, H) : null;
  const alpha = toothRegion(W, H, shifted, match, opening);
  const el = document.createElement("canvas");
  el.width = W; el.height = H;
  try {
    const ctx = el.getContext("2d");
    if (!ctx) return undefined;
    const image = ctx.createImageData(W, H);
    for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
      const v = alpha[i] > 0.02 ? 255 : 0;
      image.data[p] = image.data[p + 1] = image.data[p + 2] = v;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const png = el.toDataURL("image/png");
    return png.length <= 1_500_000 ? png : undefined;
  } finally {
    releaseCanvas(el);
  }
}

/**
 * Only the chosen tooth's region comes from the aligned result; every other
 * tooth, the gums, lips and face are the original photograph.
 */
export async function keepToothOnImages(photo: Pick<Photo, "dataUrl" | "width" | "height">, resultImage: string, guide: SmileGuide, match: ToothMatch, points: Point[] | null): Promise<string> {
  const [a, b] = await Promise.all([load(photo.dataUrl), load(resultImage)]);
  const W = a.naturalWidth, H = a.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This device could not prepare the photo.");
    ctx.drawImage(a, 0, 0);
    const original = ctx.getImageData(0, 0, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(b, 0, 0, W, H);
    const result = ctx.getImageData(0, 0, W, H);
    const opening = points && points.length >= 468 ? fillPolygon(pick(points, INNER_LIP), W, H) : null;
    const alpha = toothRegion(W, H, scaled(guide, W / (photo.width || W), H / (photo.height || H)), match, opening);
    result.data.set(keepToothRegion(original.data, result.data, alpha));
    ctx.putImageData(result, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    releaseCanvas(canvas);
  }
}
