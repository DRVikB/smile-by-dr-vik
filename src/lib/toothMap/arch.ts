import type { FullArchPlan, ToothProtection } from "../types";
import { compositeWithAlpha, erode, featherFor, measureChange } from "./masks";
import type { Point } from "./outline";
import { fillPolygon } from "./segment";
import { OUTSIDE_TOLERANCE } from "./protect";
import type { ToothMap } from "./types";

/*
 * Full-arch protection: the editable region is an ARCH, not a set of teeth.
 * Upper: the mouth opening above the occlusal split; lower: below it. The
 * opposite arch, lips and face are restored from the original photo. "Both"
 * needs nothing beyond the existing lip and face lock.
 *
 * The split follows the upper incisal edges from the tooth map (which works
 * even when individual teeth are broken down or missing), or the middle of
 * the mouth opening when no teeth were found.
 */

/**
 * Off by default: full-arch uses the existing generator with its structured
 * instruction (the opposite arch is protected by instruction, and the face
 * by the lip lock). Switch on only if testing shows the opposite arch drifts.
 */
export const FULL_ARCH_ARCH_COMPOSITE = false;

/** The occlusal split, y as a function of x, in photo pixels. */
export function occlusalSplit(map: ToothMap, width: number, height: number): ((x: number) => number) | null {
  const lip = map.mouthOpening?.map(([x, y]) => [x * width, y * height] as Point) ?? null;
  if (!lip || lip.length < 3) return null;
  const top = Math.min(...lip.map(p => p[1])), bottom = Math.max(...lip.map(p => p[1]));
  const edges: Point[] = map.teeth.filter(t => t.visible && t.outline.length >= 3).map(t => {
    const ys = t.outline.map(p => p[1] * height), xs = t.outline.map(p => p[0] * width);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys)] as Point;
  }).filter(([, y]) => y > top && y < bottom);
  if (edges.length >= 2) {
    // A straight least-squares line through the incisal edges: robust to a missing tooth or two.
    const n = edges.length, mx = edges.reduce((a, p) => a + p[0], 0) / n, my = edges.reduce((a, p) => a + p[1], 0) / n;
    const sxx = edges.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = edges.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const slope = sxx ? Math.max(-0.25, Math.min(0.25, sxy / sxx)) : 0;
    return x => Math.min(bottom, Math.max(top, my + slope * (x - mx)));
  }
  const mid = (top + bottom) / 2;
  return () => mid;
}

/** The editable region for one arch: inside the lips, on that arch's side of the split (with a small overlap). */
export function archRegion(map: ToothMap, width: number, height: number, arch: Exclude<FullArchPlan["arch"], "both">): Uint8Array | null {
  const lip = map.mouthOpening?.map(([x, y]) => [x * width, y * height] as Point) ?? null;
  const split = occlusalSplit(map, width, height);
  if (!lip || !split) return null;
  const inside = fillPolygon(lip, width, height);
  const mouthH = Math.max(...lip.map(p => p[1])) - Math.min(...lip.map(p => p[1]));
  // New teeth may reach a little past today's edges; the opposite arch's teeth stay out of reach.
  const margin = mouthH * 0.08;
  const allowed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!inside[i]) continue;
    const s = split(x);
    if (arch === "upper" ? y <= s + margin : y >= s - margin) allowed[i] = 1;
  }
  return allowed;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/** Restore everything outside the chosen arch from the original photo, and verify what is saved. */
export async function protectArch(originalUrl: string, candidateUrl: string, map: ToothMap, arch: Exclude<FullArchPlan["arch"], "both">): Promise<{ image: string; protection: ToothProtection } | null> {
  const [o, g] = await Promise.all([load(originalUrl), load(candidateUrl)]);
  const W = o.naturalWidth, H = o.naturalHeight;
  const allowed = archRegion(map, W, H, arch);
  if (!allowed) return null;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(o, 0, 0, W, H);
  const original = ctx.getImageData(0, 0, W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(g, 0, 0, W, H);
  const candidate = ctx.getImageData(0, 0, W, H);
  // A narrow feather inside the region's edge.
  const lipW = Math.max(...map.mouthOpening!.map(p => p[0] * W)) - Math.min(...map.mouthOpening!.map(p => p[0] * W));
  const r = featherFor(lipW * 0.7);
  const core = erode(allowed, W, H, r);
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = core[i] ? 255 : allowed[i] ? 128 : 0;
  const before = measureChange(original.data, candidate.data, allowed);
  const out = ctx.createImageData(W, H);
  out.data.set(compositeWithAlpha(original.data, candidate.data, alpha));
  ctx.putImageData(out, 0, 0);
  const image = canvas.toDataURL("image/jpeg", 0.95);
  const saved = await load(image);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(saved, 0, 0);
  const after = measureChange(original.data, ctx.getImageData(0, 0, W, H).data, allowed);
  return {
    image,
    protection: {
      teeth: [], notFound: [], arch,
      restoredShare: Math.round(before.outside * 10000) / 10000,
      outsideChange: Math.round(after.outside * 10000) / 10000,
      insideChange: Math.round(before.inside * 1000) / 1000,
      verified: after.outside <= OUTSIDE_TOLERANCE,
    },
  };
}
