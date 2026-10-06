import type { Photo, SmileSettings } from "./types";
import { activeToothPlans } from "./teeth";
import { releaseCanvas } from "./canvasMemory";
import { INNER_LIP, pick } from "./face/geometry";
import { fillPolygon } from "./toothMap/segment";
import { guardUpperEdges, type EdgeGuardResult } from "./edgeGuard";

/**
 * Veneers and bonding keep the patient's edge positions: whitening never changes
 * them, alignment and full arch may legitimately move them, and a tooth the
 * clinician asked to lengthen is allowed its extra length.
 */
export function shouldGuardEdges(settings: SmileSettings): boolean {
  // A one-tooth design may restore a chipped edge to its partner's length.
  if (settings.treatmentMode === "full_arch" || settings.alignment || settings.treatment === "Whitening" || settings.toothMatch) return false;
  return !activeToothPlans(settings).some(p => p.length === 1);
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be opened."));
    image.src = src;
  });
}

/** Trims any extra upper-edge length from an aligned result. Null when nothing changed or it can't be measured. */
export async function guardEdgesOnImages(photo: Pick<Photo, "dataUrl">, resultImage: string): Promise<{ image: string; report: EdgeGuardResult } | null> {
  const { detectFace } = await import("./face/landmarks");
  const points = await detectFace(photo.dataUrl).catch(() => null);
  if (!points || points.length < 468) return null;
  const [a, b] = await Promise.all([load(photo.dataUrl), load(resultImage)]);
  const w = a.naturalWidth, h = a.naturalHeight;
  if (b.naturalWidth !== w || b.naturalHeight !== h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(a, 0, 0);
    const original = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(b, 0, 0);
    const result = ctx.getImageData(0, 0, w, h);
    const report = guardUpperEdges(original.data, result.data, w, h, fillPolygon(pick(points, INNER_LIP), w, h));
    if (!report.trimmed) return null;
    result.data.set(report.pixels);
    ctx.putImageData(result, 0, 0);
    return { image: canvas.toDataURL("image/png"), report };
  } finally {
    releaseCanvas(canvas);
  }
}
