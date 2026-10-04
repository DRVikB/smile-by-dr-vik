import type { Framing, Photo } from "../types";
import { releaseCanvas } from "../canvasMemory";
import type { Point } from "../face/geometry";
import { mouthOpeningMask, planMouthLock } from "../face/lock";

/** OpenAI transparency means editable, the inverse of our compositing alpha. */
export function openAIAlphaMask(rgba: Uint8ClampedArray, encoding: "alpha" | "grayscale"): Uint8ClampedArray {
  if (rgba.length % 4) throw new Error("Mask dimensions are invalid.");
  const out = new Uint8ClampedArray(rgba.length);
  for (let p = 0; p < rgba.length; p += 4) out[p + 3] = 255 - rgba[p + (encoding === "alpha" ? 3 : 0)];
  return out;
}

async function load(src: string) { const image = new Image(); image.src = src; await image.decode(); return image; }

/** Format conversion only: reuses the reviewed Tooth Map, painted area or existing
 * mouth-lock permission. Source padding and all post-generation checks remain unchanged. */
export async function prepareOpenAIEditInput(original: Photo, prepared: { photo: Photo; sourceBounds: Framing }, guidance?: string, points?: Point[] | null): Promise<{ originalImage: string; editMask: string }> {
  const { photo, sourceBounds: bounds } = prepared;
  const canvas = document.createElement("canvas"); canvas.width = photo.width; canvas.height = photo.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The photo could not be prepared for generation.");
  const image = await load(photo.dataUrl);
  if (image.naturalWidth !== photo.width || image.naturalHeight !== photo.height) throw new Error("The prepared photo dimensions do not match.");
  ctx.drawImage(image, 0, 0);
  const originalImage = canvas.toDataURL("image/png");
  ctx.clearRect(0, 0, photo.width, photo.height);
  let permission: Uint8ClampedArray | undefined;
  if (guidance) {
    const mask = await load(guidance);
    if (mask.naturalWidth !== photo.width || mask.naturalHeight !== photo.height) throw new Error("The reviewed edit area does not match this photo.");
    ctx.drawImage(mask, 0, 0);
    permission = openAIAlphaMask(ctx.getImageData(0, 0, photo.width, photo.height).data, "grayscale");
    ctx.clearRect(0, 0, photo.width, photo.height);
  }
  if (original.editMask) {
    const mask = await load(original.editMask);
    if (mask.naturalWidth !== original.width || mask.naturalHeight !== original.height) throw new Error("The painted edit area does not match this photo.");
    ctx.drawImage(mask, bounds.x * photo.width, bounds.y * photo.height, bounds.width * photo.width, bounds.height * photo.height);
  } else if (!guidance) {
    const plan = planMouthLock(points ?? null, points ?? null);
    if (!plan) throw new Error("Face protection could not find the mouth. No generation request was sent.");
    const region = mouthOpeningMask(plan, original.width, original.height);
    const local = document.createElement("canvas"); local.width = original.width; local.height = original.height;
    const localCtx = local.getContext("2d");
    if (!localCtx || !region.width || !region.height) throw new Error("The edit area could not be prepared.");
    const pixels = localCtx.createImageData(region.width, region.height);
    for (let i = 0; i < region.alpha.length; i++) pixels.data[i * 4 + 3] = Math.round(region.alpha[i] * 255);
    localCtx.putImageData(pixels, region.x0, region.y0);
    ctx.drawImage(local, bounds.x * photo.width, bounds.y * photo.height, bounds.width * photo.width, bounds.height * photo.height);
    releaseCanvas(local);
  }
  if (!guidance || original.editMask) {
    const converted = openAIAlphaMask(ctx.getImageData(0, 0, photo.width, photo.height).data, "alpha");
    // If both existing protections are present, keep their intersection.
    if (permission) for (let p = 3; p < converted.length; p += 4) converted[p] = Math.max(converted[p], permission[p]);
    permission = converted;
  }
  if (!permission || !permission.some((v, i) => i % 4 === 3 && v < 255)) throw new Error("No editable area was found. No generation request was sent.");
  const out = ctx.createImageData(photo.width, photo.height); out.data.set(permission); ctx.putImageData(out, 0, 0);
  const editMask = canvas.toDataURL("image/png");
  releaseCanvas(canvas);
  return { originalImage, editMask };
}
