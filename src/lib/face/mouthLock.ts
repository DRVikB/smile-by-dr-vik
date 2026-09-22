import { compositeMasked, polygonMask } from "./geometry";
import { detectFace } from "./landmarks";
import { planMouthLock } from "./lock";

export interface MouthLockResult {
  image: string;
  /** True when everything outside the lips is the original photograph. */
  locked: boolean;
  lipsMoved: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/**
 * Put the AI edit back onto the original photograph so that nothing outside
 * the lips can change: skin, eyes, nose, hair and background are the
 * patient's own pixels. If the face can't be found, the edit is returned
 * untouched rather than guessed at.
 */
export async function lockFaceOutsideLips(
  original: string,
  generated: string,
): Promise<MouthLockResult> {
  const untouched = { image: generated, locked: false, lipsMoved: false };
  try {
    const [origPoints, genPoints] = await Promise.all([
      detectFace(original),
      detectFace(generated),
    ]);
    const plan = planMouthLock(origPoints, genPoints);
    if (!plan) return untouched;

    const [o, g] = await Promise.all([loadImage(original), loadImage(generated)]);
    const width = o.naturalWidth, height = o.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return untouched;

    ctx.drawImage(o, 0, 0, width, height);
    const originalPixels = ctx.getImageData(0, 0, width, height);

    // Where a warp leaves an edge uncovered, the original shows through.
    const { a, b, tx, ty } = plan.transform;
    ctx.setTransform(a, b, -b, a, tx, ty);
    ctx.drawImage(g, 0, 0, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const editedPixels = ctx.getImageData(0, 0, width, height);

    const mask = polygonMask(plan.polygon, width, height, plan.grow, plan.feather);
    const merged = compositeMasked(originalPixels.data, editedPixels.data, width, mask);
    editedPixels.data.set(merged);
    ctx.putImageData(editedPixels, 0, 0);
    return {
      image: canvas.toDataURL("image/jpeg", 0.95),
      locked: true,
      lipsMoved: plan.lipsMoved,
    };
  } catch {
    return untouched;
  }
}
