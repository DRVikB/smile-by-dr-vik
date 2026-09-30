import type { SmileSettings, ToothProtection } from "../types";
import { buildEditRegion, compositeWithAlpha, featherFor, measureChange, selectedPlans, toothEditRule } from "./masks";
import type { Point } from "./segment";
import { fdiOrder, photoFingerprint, type ToothMap } from "./types";

/**
 * The final, mandatory protection step. After generation the ORIGINAL photo is
 * the source of truth: the concept keeps generated pixels only inside the
 * selected teeth's allowed region (with a narrow feather inside its edge), and
 * every other pixel — lips, skin, gingiva, unselected teeth — is restored from
 * the original. Then it checks: outside the region, the result must match the
 * original to within compression noise.
 */

/** Outside the allowed region, at most this share of pixels may differ beyond JPEG noise. */
export const OUTSIDE_TOLERANCE = 0.002;

export interface ProtectOutcome {
  image: string;
  protection: ToothProtection;
  /** Development only: green = allowed edit area, red = what the AI changed outside it (all restored). */
  debugImage?: string;
  /** Development only: the combined edit mask as a greyscale image. */
  debugMask?: string;
}

/** Why the tooth map can't protect this result; the existing lip and face lock still applies. */
export type ProtectSkip = "no-map" | "stale-map" | "alignment" | "full-arch" | "standard" | "no-teeth";

/**
 * Precision masking is for SINGLE-TOOTH edits only. Normal 4 / 6 / 8 / 10
 * and multi-tooth designs use the standard generator with the lip and face
 * lock (and any painted edit area) — image quality first. Set to true only
 * if testing shows per-tooth compositing improves multi-tooth results.
 */
export const PRECISION_FOR_MULTIPLE_TEETH = false;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/** Whether the map can govern this design; if not, why. */
export function protectionPlan(map: ToothMap | null | undefined, originalDataUrl: string, settings: SmileSettings):
  { ok: true; teeth: number[]; notFound: number[] } | { ok: false; reason: ProtectSkip } {
  if (!map || !map.teeth.some(t => t.visible && t.fdi !== null)) return { ok: false, reason: "no-map" };
  if (map.photoId !== photoFingerprint(originalDataUrl)) return { ok: false, reason: "stale-map" };
  // Full-arch protects by arch (arch.ts), not by tooth.
  if (settings.treatmentMode === "full_arch" && settings.fullArch) return { ok: false, reason: "full-arch" };
  // Moving whole teeth isn't a repaint of their outlines: alignment keeps the lip and face lock for now.
  if (settings.alignment && !settings.alignment.only) return { ok: false, reason: "alignment" };
  // Chart order (patient's right to left), as the clinician reads it.
  const wanted = fdiOrder([...selectedPlans(settings).keys()]);
  if (wanted.length > 1 && !PRECISION_FOR_MULTIPLE_TEETH) return { ok: false, reason: "standard" };
  const present = new Set(map.teeth.filter(t => t.visible && t.fdi !== null).map(t => t.fdi as number));
  const teeth = wanted.filter(t => present.has(t));
  if (!teeth.length) return { ok: false, reason: "no-teeth" };
  return { ok: true, teeth, notFound: wanted.filter(t => !present.has(t)) };
}

/**
 * The combined edit region as a black-and-white PNG aligned to the request
 * canvas (white = may change), sent to the provider as guidance. Guidance
 * only: the compositing above is what protects the photo.
 */
export function guidanceMask(map: ToothMap, originalDataUrl: string, settings: SmileSettings, canvasSize: { width: number; height: number }, sourceBounds: { x: number; y: number; width: number; height: number }): string | undefined {
  const plan = protectionPlan(map, originalDataUrl, settings);
  if (!plan.ok) return undefined;
  const W = canvasSize.width, H = canvasSize.height;
  const px = (outline: [number, number][]): Point[] => outline.map(([x, y]) => [(sourceBounds.x + x * sourceBounds.width) * W, (sourceBounds.y + y * sourceBounds.height) * H]);
  const plans = selectedPlans(settings);
  const chosen = new Set(plan.teeth);
  const region = buildEditRegion({
    width: W, height: H,
    selected: map.teeth.filter(t => t.visible && t.fdi !== null && chosen.has(t.fdi)).map(t => ({ outline: px(t.outline), rule: toothEditRule(settings, plans.get(t.fdi as number)) })),
    protectedTeeth: map.teeth.filter(t => !(t.visible && t.fdi !== null && chosen.has(t.fdi))).map(t => px(t.outline)),
    mouthOpening: map.mouthOpening ? px(map.mouthOpening) : null,
    feather: 0,
  });
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const image = ctx.createImageData(W, H);
  for (let i = 0, p = 0; i < region.allowed.length; i++, p += 4) {
    const v = region.allowed[i] ? 255 : 0;
    image.data[p] = image.data[p + 1] = image.data[p + 2] = v;
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const png = canvas.toDataURL("image/png");
  return png.length <= 1_500_000 ? png : undefined;
}

export async function protectWithToothMap(
  originalUrl: string,
  candidateUrl: string,
  map: ToothMap,
  settings: SmileSettings,
  options: { debug?: boolean } = {},
): Promise<ProtectOutcome> {
  const plan = protectionPlan(map, originalUrl, settings);
  if (!plan.ok) throw new Error(`Tooth map protection unavailable: ${plan.reason}`);
  const [o, g] = await Promise.all([load(originalUrl), load(candidateUrl)]);
  const W = o.naturalWidth, H = o.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Tooth protection is unavailable on this device.");
  ctx.drawImage(o, 0, 0, W, H);
  const original = ctx.getImageData(0, 0, W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(g, 0, 0, W, H);
  const candidate = ctx.getImageData(0, 0, W, H);

  const px = (outline: [number, number][]): Point[] => outline.map(([x, y]) => [x * W, y * H]);
  const plans = selectedPlans(settings);
  const chosen = new Set(plan.teeth);
  const visible = map.teeth.filter(t => t.visible && t.fdi !== null);
  const selected = visible.filter(t => chosen.has(t.fdi as number)).map(t => ({ outline: px(t.outline), rule: toothEditRule(settings, plans.get(t.fdi as number)) }));
  // Every other region the map knows about, numbered or not, is protected.
  const protectedTeeth = map.teeth.filter(t => !(t.visible && t.fdi !== null && chosen.has(t.fdi))).map(t => px(t.outline));
  const xs = visible.flatMap(t => t.outline.map(p => p[0] * W));
  const region = buildEditRegion({
    width: W,
    height: H,
    selected,
    protectedTeeth,
    mouthOpening: map.mouthOpening ? px(map.mouthOpening) : null,
    feather: featherFor(Math.max(...xs) - Math.min(...xs)),
  });

  const before = measureChange(original.data, candidate.data, region.allowed);
  const merged = compositeWithAlpha(original.data, candidate.data, region.alpha);
  const out = ctx.createImageData(W, H);
  out.data.set(merged);
  ctx.putImageData(out, 0, 0);
  const image = canvas.toDataURL("image/jpeg", 0.95);

  // Verify what will actually be saved: decode the JPEG and compare outside the region.
  const saved = await load(image);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(saved, 0, 0);
  const after = measureChange(original.data, ctx.getImageData(0, 0, W, H).data, region.allowed);

  const protection: ToothProtection = {
    teeth: plan.teeth,
    notFound: plan.notFound,
    restoredShare: Math.round(before.outside * 10000) / 10000,
    outsideChange: Math.round(after.outside * 10000) / 10000,
    insideChange: Math.round(before.inside * 1000) / 1000,
    verified: after.outside <= OUTSIDE_TOLERANCE,
  };

  let debugImage: string | undefined, debugMask: string | undefined;
  if (options.debug) {
    const heat = new ImageData(W, H), mask = new ImageData(W, H);
    for (let i = 0, p = 0; i < region.allowed.length; i++, p += 4) {
      const l = 0.3 * original.data[p] + 0.59 * original.data[p + 1] + 0.11 * original.data[p + 2];
      const d = Math.max(Math.abs(original.data[p] - candidate.data[p]), Math.abs(original.data[p + 1] - candidate.data[p + 1]), Math.abs(original.data[p + 2] - candidate.data[p + 2]));
      let r = l * 0.55, gch = l * 0.55, b = l * 0.55;
      if (region.allowed[i]) { gch = Math.min(255, gch + 110); }
      else if (d > 18) { r = 255; gch *= 0.3; b *= 0.3; }
      heat.data[p] = r; heat.data[p + 1] = gch; heat.data[p + 2] = b; heat.data[p + 3] = 255;
      mask.data[p] = mask.data[p + 1] = mask.data[p + 2] = region.alpha[i]; mask.data[p + 3] = 255;
    }
    ctx.putImageData(heat, 0, 0);
    debugImage = canvas.toDataURL("image/jpeg", 0.85);
    ctx.putImageData(mask, 0, 0);
    debugMask = canvas.toDataURL("image/png");
  }
  return { image, protection, debugImage, debugMask };
}
