import { captureWorkspace, type WorkspaceLease } from "./workspace";
import { OUTER_LIP, pick } from "./face/geometry";

/**
 * Case Library image processing, on the device:
 *   original   the photo, downscaled to at most 2048 px (kept privately)
 *   reference  the smile region, at most 1280 px — the only image sent to the
 *              AI provider as a style reference (data minimisation). When no
 *              face is found (a retracted or dental close-up), the downscaled
 *              photo is already dental-only and is used as it is.
 */
export interface ReferenceImages { original: string; reference: string; smileRegion: boolean }

async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function draw(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This photo couldn’t be processed.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** The smile box around the outer lip border, widened for context and kept at 16:10. */
export function smileBox(lip: [number, number][], width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  if (lip.length < 3) return null;
  const xs = lip.map(p => p[0]), ys = lip.map(p => p[1]);
  const lipW = Math.max(...xs) - Math.min(...xs);
  if (lipW < 20) return null;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  let w = Math.min(width, lipW * 1.8);
  const h = Math.min(height, w / 1.6);
  w = Math.min(w, h * 1.6);
  const x = Math.max(0, Math.min(width - w, cx - w / 2));
  const y = Math.max(0, Math.min(height - h, cy - h / 2));
  return { x, y, w, h };
}

export async function prepareReferenceImages(file: File, scope: WorkspaceLease = captureWorkspace()): Promise<ReferenceImages> {
  scope.assert();
  const { preparePhoto } = await import("./photos");
  scope.assert();
  const photo = await preparePhoto(file);
  const source = await load(photo.dataUrl);
  const original = draw(source, 0, 0, source.naturalWidth, source.naturalHeight, 2048, 0.88);
  const { detectFace } = await import("./face/landmarks");
  scope.assert();
  const points = await detectFace(photo.dataUrl).catch(() => null);
  scope.assert();
  const box = points ? smileBox(pick(points, OUTER_LIP), source.naturalWidth, source.naturalHeight) : null;
  const reference = box
    ? draw(source, box.x, box.y, box.w, box.h, 1280, 0.86)
    : draw(source, 0, 0, source.naturalWidth, source.naturalHeight, 1280, 0.86);
  return { original, reference, smileRegion: Boolean(box) };
}
