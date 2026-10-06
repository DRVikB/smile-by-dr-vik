import type { Framing, Photo } from "./types";
import { releaseCanvas } from "./canvasMemory";

/** The iPhone front (selfie) camera's shape: portrait 3:4. Every camera capture is cropped to it. */
export const SELFIE_ASPECT = 3 / 4;

/** Where the patient's face is, in photo pixels: its centre across, and its centre down. */
export interface FaceCentre { x: number; y: number }

/**
 * The largest 3:4 portrait crop of a `w`×`h` photo, kept inside the photo and
 * centred on the patient's face when it was found, otherwise on the smile guide
 * (or the middle). Null when the photo is already 3:4.
 */
export function selfieCrop(w: number, h: number, framing?: Framing, face?: FaceCentre | null): { x: number; y: number; width: number; height: number } | null {
  if (!(w > 0 && h > 0) || Math.abs(w / h - SELFIE_ASPECT) < 0.01) return null;
  if (face) {
    const width = w / h > SELFIE_ASPECT ? Math.round(h * SELFIE_ASPECT) : w;
    const height = w / h > SELFIE_ASPECT ? h : Math.round(w / SELFIE_ASPECT);
    return {
      x: Math.round(Math.min(w - width, Math.max(0, face.x - width / 2))),
      // A little more room above the face than below, as in a selfie.
      y: Math.round(Math.min(h - height, Math.max(0, face.y - height * 0.55))),
      width, height,
    };
  }
  const cx = framing ? (framing.x + framing.width / 2) * w : w / 2;
  const cy = framing ? (framing.y + framing.height / 2) * h : h / 2;
  // Wider than 3:4 (an iPad's landscape front camera): full height, trimmed sides. Taller: full width.
  const width = w / h > SELFIE_ASPECT ? Math.round(h * SELFIE_ASPECT) : w;
  const height = w / h > SELFIE_ASPECT ? h : Math.round(w / SELFIE_ASPECT);
  // The smile guide sits in the lower half of a selfie; keep it there, not in the middle.
  const x = Math.round(Math.min(w - width, Math.max(0, cx - width / 2)));
  const y = Math.round(Math.min(h - height, Math.max(0, cy - height * 0.6)));
  return { x, y, width, height };
}

/** The smile guide's position in the cropped photo. */
export function cropFraming(framing: Framing, w: number, h: number, crop: { x: number; y: number; width: number; height: number }): Framing {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp((framing.x * w - crop.x) / crop.width), y0 = clamp((framing.y * h - crop.y) / crop.height);
  const x1 = clamp(((framing.x + framing.width) * w - crop.x) / crop.width), y1 = clamp(((framing.y + framing.height) * h - crop.y) / crop.height);
  return { x: x0, y: y0, width: Math.max(0.01, x1 - x0), height: Math.max(0.01, y1 - y0) };
}

/** The face's centre from its landmarks (the middle of the face outline), in the landmarks' pixels. */
export function faceCentre(points: readonly (readonly [number, number])[]): FaceCentre | null {
  if (points.length < 468) return null;
  const face = points.slice(0, 468);
  const xs = face.map(p => p[0]), ys = face.map(p => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * A camera capture in the selfie camera's 3:4 portrait shape, on the device,
 * centred on the patient's face (found on the device), or the smile guide if no
 * face is found.
 */
export async function toSelfieAspect(photo: Photo): Promise<Photo> {
  if (Math.abs(photo.width / photo.height - SELFIE_ASPECT) < 0.01) return photo;
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The photo could not be opened.")); image.src = photo.dataUrl; });
  const sx = image.naturalWidth / photo.width, sy = image.naturalHeight / photo.height;
  const points = await import("./face/landmarks").then(m => m.detectFace(photo.dataUrl)).catch(() => null);
  const found = points ? faceCentre(points) : null;
  // Landmarks are in the image's own pixels; the crop is in the photo's.
  const crop = selfieCrop(photo.width, photo.height, photo.framing, found ? { x: found.x / sx, y: found.y / sy } : null);
  if (!crop) return photo;
  const canvas = document.createElement("canvas");
  canvas.width = crop.width; canvas.height = crop.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return photo;
    ctx.drawImage(image, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy, 0, 0, crop.width, crop.height);
    return {
      ...photo, dataUrl: canvas.toDataURL("image/jpeg", 0.93), width: crop.width, height: crop.height,
      ...(photo.framing ? { framing: cropFraming(photo.framing, photo.width, photo.height, crop) } : {}),
    };
  } finally {
    releaseCanvas(canvas);
  }
}
