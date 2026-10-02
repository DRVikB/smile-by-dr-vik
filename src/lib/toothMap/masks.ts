import { activeToothPlans, resolvedToothIntent } from "../teeth";
import type { SmileSettings, ToothPlan } from "../types";
import { fillPolygon, type Point } from "./segment";

/**
 * The three regions behind every tooth-specific edit, in image pixels:
 *
 *   EXACT      the tooth as photographed — shade, brightness, texture.
 *   INFLUENCE  a local, direction-aware allowance around it where the design
 *              changes form: most at the incisal edge, controlled mesially and
 *              distally, none at the gum line (gingiva protected).
 *   PROTECTED  everything else: lips, skin, gingiva, every unselected tooth.
 *
 * The final alpha is 255 in the core, falls to 0 across a narrow feather
 * inside the allowed region, and is exactly 0 everywhere protected.
 */

export interface ToothEditRule {
  /** Only the tooth's own pixels may change (whitening and shade-only). */
  exactOnly: boolean;
  /** Extra width on each side, as a share of the tooth's width. */
  lateral: number;
  /** Extra length at the incisal edge, as a share of the tooth's height. */
  incisal: number;
  /** Extra room at the gum line; 0 while gingiva is protected. */
  cervical: number;
  /** Lower teeth grow incisally upwards in the photograph. */
  direction?: 1 | -1;
}

export interface MaskOptions {
  /** Gum margins never change unless a future gum-contouring mode allows it. */
  protectGingiva: boolean;
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = { protectGingiva: true };

/** What a tooth's plan and the treatment allow its region to become. */
export function toothEditRule(settings: SmileSettings, plan: ToothPlan | undefined, options: MaskOptions = DEFAULT_MASK_OPTIONS): ToothEditRule {
  const intent = plan ? resolvedToothIntent(settings, plan) : settings.designIntent ?? "Auto";
  if (intent === "Shade only" || settings.alignment?.only) return { exactOnly: true, lateral: 0, incisal: 0, cervical: 0 };
  const porcelain = settings.treatment === "Porcelain";
  let lateral = porcelain ? 0.1 : 0.06;
  let incisal = porcelain ? 0.14 : 0.1;
  if (intent === "Repair edges") { lateral = 0.03; incisal = 0.08; }
  if (intent === "Close gaps") lateral = Math.max(lateral, 0.16);
  if (intent === "Reshape") { lateral += 0.02; incisal += 0.02; }
  if (plan?.width === 1) lateral += 0.05;
  if (plan?.length === 1) incisal += 0.08;
  return { exactOnly: false, lateral: Math.min(lateral,0.18), incisal: Math.min(incisal,porcelain?0.2:0.14), cervical: options.protectGingiva ? 0 : 0.04, direction: plan && plan.tooth >= 30 ? -1 : 1 };
}

/**
 * The influence outline: the tooth scaled about the middle of its gum line,
 * so it grows sideways and towards the incisal edge but not into the gum.
 */
export function influenceOutline(outline: Point[], rule: ToothEditRule): Point[] {
  if (rule.exactOnly || !outline.length) return outline;
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const direction=rule.direction??1;
  const ax = (x0 + x1) / 2, ay = direction===1?y0:y1;
  // Room at the gum line (only when gingiva isn't protected) lifts the top edge, fading to none at the incisal edge.
  const lift = (y1 - y0) * rule.cervical;
  return outline.map(([x, y]) => {
    const progress=Math.max(0,Math.min(1,direction*(y-ay)/Math.max(1,y1-y0)));
    // No cervical expansion: new lateral contour starts only in the incisal half.
    const taper=Math.max(0,(progress-0.5)*2);
    return [ax+(x-ax)*(1+2*rule.lateral*taper),y+direction*(y1-y0)*rule.incisal*taper-direction*lift*(1-progress)];
  });
}

/** Box-sum based morphology on a 0/1 mask: `r` is the half-width. */
function boxCount(mask: Uint8Array, w: number, h: number, r: number): Int32Array {
  const horiz = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const row = y * w;
    for (let x = -r; x < w; x++) {
      if (x + r < w) s += mask[row + x + r];
      if (x - r - 1 >= 0) s -= mask[row + x - r - 1];
      if (x >= 0) horiz[row + x] = s;
    }
  }
  const out = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) s += horiz[(y + r) * w + x];
      if (y - r - 1 >= 0) s -= horiz[(y - r - 1) * w + x];
      if (y >= 0) out[y * w + x] = s;
    }
  }
  return out;
}

export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const count = boxCount(mask, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = count[i] > 0 ? 1 : 0;
  return out;
}

export function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const count = boxCount(mask, w, h, r);
  const out = new Uint8Array(w * h);
  // Outside the image counts as empty, so the border erodes too.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const full = (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1) * (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
      const i = y * w + x;
      out[i] = count[i] === full && x >= r && y >= r && x < w - r && y < h - r ? 1 : 0;
    }
  return out;
}

export interface EditRegionInput {
  width: number;
  height: number;
  /** Selected teeth: their outlines in pixels and what each may become. */
  selected: { outline: Point[]; rule: ToothEditRule }[];
  /** Every other visible tooth: never changed. */
  protectedTeeth: Point[][];
  /** The mouth opening; nothing outside it (lips, skin) may change. */
  mouthOpening?: Point[] | null;
  /** Optional original pixels: influence may only extend into dark oral space, not unmapped enamel or pink gingiva. */
  original?: Uint8ClampedArray;
  /** Width of the soft edge, in pixels. */
  feather: number;
}

export interface EditRegion {
  /** 1 where an edit is allowed at all. */
  allowed: Uint8Array;
  /** 0–255 per pixel: how much of the generated image to keep. 0 wherever not allowed. */
  alpha: Uint8Array;
}

export function buildEditRegion(input: EditRegionInput): EditRegion {
  const { width: w, height: h } = input;
  const allowed = new Uint8Array(w * h);
  const exactUnion = new Uint8Array(w * h);
  for (const tooth of input.selected) {
    const exact = fillPolygon(tooth.outline, w, h);
    // Without a trustworthy inner-lip boundary, conservative exact editing only.
    const influence = tooth.rule.exactOnly || !input.mouthOpening || input.mouthOpening.length<3 ? exact : fillPolygon(influenceOutline(tooth.outline, tooth.rule), w, h);
    for (let i = 0; i < allowed.length; i++) { if(exact[i])exactUnion[i]=1; if (exact[i] || influence[i]) allowed[i] = 1; }
  }
  if(input.original){
    if(input.original.length!==w*h*4)throw new Error("The protection source and masks are different sizes.");
    for(let i=0,p=0;i<allowed.length;i++,p+=4)if(allowed[i]&&!exactUnion[i]){
      const r=input.original[p],g=input.original[p+1],b=input.original[p+2];
      // Fail conservatively: unknown bright/shadowed enamel and red soft tissue
      // stay original. Dark inter-tooth/oral space can accommodate modest contour.
      const oralSpace=r<85&&g<75&&b<75&&!(r>45&&r-g>14);
      if(!oralSpace)allowed[i]=0;
    }
  }
  // Unselected teeth, with a pixel of margin, are never inside the edit.
  if (input.protectedTeeth.length) {
    const others = new Uint8Array(w * h);
    for (const outline of input.protectedTeeth) {
      const m = fillPolygon(outline, w, h);
      for (let i = 0; i < m.length; i++) if (m[i]) others[i] = 1;
    }
    const guard = dilate(others, w, h, 1);
    for (let i = 0; i < allowed.length; i++) if (guard[i]) allowed[i] = 0;
  }
  if (input.mouthOpening && input.mouthOpening.length >= 3) {
    const mouth = fillPolygon(input.mouthOpening, w, h);
    for (let i = 0; i < allowed.length; i++) if (!mouth[i]) allowed[i] = 0;
  }
  // Feather inside the boundary only: erode, then blur back out to the edge.
  const r = Math.max(0, Math.round(input.feather));
  const core = erode(allowed, w, h, r);
  const alpha = new Uint8Array(w * h);
  if (r === 0) {
    for (let i = 0; i < alpha.length; i++) alpha[i] = allowed[i] ? 255 : 0;
    return { allowed, alpha };
  }
  const count = boxCount(core, w, h, r);
  const area = (2 * r + 1) ** 2;
  for (let i = 0; i < alpha.length; i++) alpha[i] = allowed[i] ? Math.round((255 * count[i]) / area) : 0;
  return { allowed, alpha };
}

/** A narrow feather: a few pixels on a phone photo, never a wide blur. */
export function featherFor(teethWidthPx: number): number {
  return Math.max(1, Math.min(6, Math.round(teethWidthPx * 0.006)));
}

/** The active plan for each selected tooth (a preset gives each tooth the global goal). */
export function selectedPlans(settings: SmileSettings): Map<number, ToothPlan> {
  return new Map(activeToothPlans(settings).map(p => [p.tooth, p]));
}

/** Keep the original outside the edit and blend inside it. Exact where alpha is 0. */
export function compositeWithAlpha(original: Uint8ClampedArray, generated: Uint8ClampedArray, alpha: Uint8Array): Uint8ClampedArray {
  if (original.length !== generated.length || original.length !== alpha.length * 4) throw new Error("The edit and the photo are different sizes.");
  const out = new Uint8ClampedArray(original);
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const a = alpha[i];
    if (a === 0) continue;
    if (a === 255) { out[p] = generated[p]; out[p + 1] = generated[p + 1]; out[p + 2] = generated[p + 2]; continue; }
    for (let c = 0; c < 3; c++) out[p + c] = Math.round((original[p + c] * (255 - a) + generated[p + c] * a) / 255);
  }
  return out;
}

export interface ChangeReport {
  /** Share of protected pixels that differ noticeably from the original. */
  outside: number;
  /** Share of allowed pixels that changed noticeably (did the selected teeth change?). */
  inside: number;
}

/** How much changed outside and inside the allowed region. `tolerance` absorbs compression noise. */
export function measureChange(original: Uint8ClampedArray, candidate: Uint8ClampedArray, allowed: Uint8Array, tolerance = 18): ChangeReport {
  let outN = 0, outChanged = 0, inN = 0, inChanged = 0;
  for (let i = 0, p = 0; i < allowed.length; i++, p += 4) {
    const d = Math.max(Math.abs(original[p] - candidate[p]), Math.abs(original[p + 1] - candidate[p + 1]), Math.abs(original[p + 2] - candidate[p + 2]));
    if (allowed[i]) { inN++; if (d > tolerance) inChanged++; } else { outN++; if (d > tolerance) outChanged++; }
  }
  return { outside: outN ? outChanged / outN : 0, inside: inN ? inChanged / inN : 0 };
}
