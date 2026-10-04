import type { Framing } from "./types";

/** The uncropped photograph's viewport, excluding blurred letterboxing. */
export function containedPhotoRect(frameWidth: number, frameHeight: number, imageWidth: number, imageHeight: number) {
  if (![frameWidth, frameHeight, imageWidth, imageHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale, height = imageHeight * scale;
  return { left: (frameWidth - width) / 2, top: (frameHeight - height) / 2, width, height };
}

export interface FocusOptions {
  /** The part of the photograph that must stay in view (the smile), as fractions. */
  region?: Framing | null;
  /** Where on the frame the region's centre should land, as fractions. */
  anchor?: { x: number; y: number };
  /** The most of either dimension that may be cropped away (0 = contain, 1 = cover). */
  maxCrop?: number;
  /** Extra enlargement beyond cover allowed to bring the region to the anchor. */
  maxZoom?: number;
  /** Space kept around the region, as a share of its size on each side. */
  margin?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The photograph enlarged towards filling the frame, positioned so the region
 * (the smile) sits at the anchor. It never crops into the region, never crops
 * more than maxCrop of either dimension, and only enlarges past cover (up to
 * maxZoom) to move the region towards the anchor. Where the photograph cannot
 * fill a dimension, it stays wholly inside it.
 */
export function focusedPhotoRect(frameWidth: number, frameHeight: number, imageWidth: number, imageHeight: number, options: FocusOptions = {}) {
  if (![frameWidth, frameHeight, imageWidth, imageHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const { region, anchor = { x: 0.5, y: 0.5 }, maxCrop = 1, maxZoom = 1, margin = 0.12 } = options;
  const contain = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const cover = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const box = region && region.width > 0 && region.height > 0
    ? { x: clamp(region.x, 0, 1), y: clamp(region.y, 0, 1), width: clamp(region.width, 0, 1), height: clamp(region.height, 0, 1) }
    : null;
  // The largest scale at which the region (with its margin) and enough of the photograph stay visible.
  const keep = Math.max(0.01, 1 - clamp(maxCrop, 0, 1));
  let limit = Math.min(frameWidth / (imageWidth * keep), frameHeight / (imageHeight * keep));
  if (box) {
    const visibleW = Math.min(1, box.width * (1 + 2 * margin)), visibleH = Math.min(1, box.height * (1 + 2 * margin));
    limit = Math.min(limit, frameWidth / (imageWidth * visibleW), frameHeight / (imageHeight * visibleH));
  }
  let scale = clamp(cover, contain, Math.max(contain, limit));
  const focus = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0.5, y: 0.5 };
  if (scale >= cover && maxZoom > 1) {
    // Enlarge only as far as needed for the region to reach the anchor without exposing an edge.
    const need = (a: number, f: number, frame: number, image: number) =>
      Math.max(f > 0 ? (a * frame) / (f * image) : 0, f < 1 ? ((1 - a) * frame) / ((1 - f) * image) : 0);
    const wanted = Math.max(need(anchor.x, focus.x, frameWidth, imageWidth), need(anchor.y, focus.y, frameHeight, imageHeight));
    scale = clamp(wanted, scale, Math.min(cover * maxZoom, Math.max(scale, limit)));
  }
  const width = imageWidth * scale, height = imageHeight * scale;
  const place = (a: number, f: number, frame: number, size: number) =>
    clamp(a * frame - f * size, Math.min(0, frame - size), Math.max(0, frame - size));
  return { left: place(anchor.x, focus.x, frameWidth, width), top: place(anchor.y, focus.y, frameHeight, height), width, height };
}

/**
 * A CSS mask that fades whichever edges of the photograph stop short of the
 * frame into what lies behind it (a blurred copy). Undefined when it fills.
 */
export function edgeFadeMask(rect: { left: number; top: number; width: number; height: number }, frameWidth: number, frameHeight: number, fade = 0.18): string | undefined {
  const pct = Math.round(fade * 100);
  const side = (start: boolean, end: boolean, direction: string) => (start || end)
    ? `linear-gradient(${direction}, ${start ? `transparent 0, #000 ${pct}%` : "#000 0"}, ${end ? `#000 ${100 - pct}%, transparent 100%` : "#000 100%"})`
    : null;
  const x = side(rect.left > 0.5, rect.left + rect.width < frameWidth - 0.5, "90deg");
  const y = side(rect.top > 0.5, rect.top + rect.height < frameHeight - 0.5, "180deg");
  return [x, y].filter(Boolean).join(", ") || undefined;
}

/** Style properties for edgeFadeMask, with the prefixes WebKit still needs. */
export function maskStyle(mask: string | undefined) {
  return mask ? { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" } : {};
}
