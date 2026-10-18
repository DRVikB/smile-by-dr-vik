import type { Photo, SmileSettings } from "./types";
import { releaseCanvas } from "./canvasMemory";
import { INNER_LIP, pick } from "./face/geometry";
import { fillPolygon } from "./toothMap/segment";
import { assessQuality, type QualityReport } from "./qualityCheck";

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("decode")); i.src = src; });

/**
 * Quality control on images (see qualityCheck.ts): the original photo, the image service's result
 * aligned to it, and the final image shown. The mouth opening comes from the face landmarks, or a
 * close-up's painted area. Null when it can't be measured (no face and no painted area).
 */
export async function assessResultQuality(photo: Pick<Photo, "dataUrl" | "editMask">, serviceImage: string, finalImage: string, settings: SmileSettings, options: { lipsRestored?: boolean } = {}): Promise<QualityReport | null> {
  const { detectFace } = await import("./face/landmarks");
  const points = await detectFace(photo.dataUrl).catch(() => null);
  if (!points && !photo.editMask) return null;
  const images = await Promise.all([photo.dataUrl, serviceImage, finalImage, ...(points ? [] : [photo.editMask!])].map(load));
  const W = images[0].naturalWidth, H = images[0].naturalHeight;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    const read = (img: HTMLImageElement) => { ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; };
    const [original, service, final] = images.slice(0, 3).map(read);
    let opening: Uint8Array;
    if (points) opening = fillPolygon(pick(points, INNER_LIP), W, H);
    else { const m = read(images[3]); opening = new Uint8Array(W * H); for (let i = 0; i < opening.length; i++) opening[i] = m[i * 4 + 3] > 128 ? 1 : 0; }
    return assessQuality(original, final, W, H, opening, settings, service, Boolean(points), Boolean(points) && options.lipsRestored);
  } finally { releaseCanvas(canvas); }
}
