/**
 * The developer-only Tooth Map debug view: tooth outlines, labels, confidence,
 * masks and the unexpected-change heatmap. Available in development builds
 * (or a build made with NEXT_PUBLIC_SMILE_DEBUG=1) and never drawn into
 * anything a patient receives — exports are separate artwork.
 */
export const TOOTH_MAP_DEBUG = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SMILE_DEBUG === "1";

export interface ToothDebugImages {
  heatmap?: string;
  mask?: string;
}

// Kept in memory only (never saved with the case): the last few results.
const store = new Map<string, ToothDebugImages>();

export function rememberToothDebug(image: string, images: ToothDebugImages): void {
  if (!TOOTH_MAP_DEBUG) return;
  store.set(image, images);
  while (store.size > 4) store.delete(store.keys().next().value!);
}

export function toothDebugFor(image: string | undefined): ToothDebugImages | undefined {
  return image ? store.get(image) : undefined;
}

// The map before SlimSAM refinement, by photo fingerprint, for the raw-vs-refined-vs-template comparison.
const rough = new Map<string, import("./types").ToothMap>();

export function rememberRoughMap(map: import("./types").ToothMap): void {
  if (!TOOTH_MAP_DEBUG) return;
  rough.set(map.photoId, map);
  while (rough.size > 4) rough.delete(rough.keys().next().value!);
}

export function roughMapFor(photoId: string | undefined): import("./types").ToothMap | undefined {
  return photoId ? rough.get(photoId) : undefined;
}
