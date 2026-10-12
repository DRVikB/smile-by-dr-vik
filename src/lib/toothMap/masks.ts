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
  const intent = settings.treatment === "Whitening" ? "Shade only" : plan ? resolvedToothIntent(settings, plan) : settings.designIntent ?? "Auto";
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
  /** Close horizontal gaps up to this many pixels between selected teeth (automatic maps). */
  bridge?: number;
  /**
   * Automatic maps, restorative designs: the selected teeth of each arch form one smooth band rather
   * than separate outlines, with room at the incisal edge for longer teeth. New teeth are a different
   * shape from the worn ones they replace, so cutting along the old outlines chips their edges.
   */
  band?: boolean;
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
  // A band needs the inner-lip boundary to stop at; without one it stays with the outlines above.
  const band = input.band && input.mouthOpening && input.mouthOpening.length >= 3 ? archBands(input.selected, w, h) : null;
  if (band) for (let i = 0; i < allowed.length; i++) if (band.mask[i]) allowed[i] = 1;
  if(input.original&&!band){
    if(input.original.length!==w*h*4)throw new Error("The protection source and masks are different sizes.");
    for(let i=0,p=0;i<allowed.length;i++,p+=4)if(allowed[i]&&!exactUnion[i]){
      const r=input.original[p],g=input.original[p+1],b=input.original[p+2];
      // Fail conservatively: unknown bright/shadowed enamel and red soft tissue
      // stay original. Dark inter-tooth/oral space can accommodate modest contour.
      const oralSpace=r<85&&g<75&&b<75&&!(r>45&&r-g>14);
      if(!oralSpace)allowed[i]=0;
    }
  }
  // Automatic outlines can stop short of contacts or miss a tooth between two
  // selected ones: close those gaps along each row, never upwards or downwards.
  if (!band && input.bridge && input.bridge > 0) {
    const closed = closeRows(allowed, w, h, Math.round(input.bridge));
    allowed.set(closed);
  }
  // Unselected teeth, with a pixel of margin, are never inside the edit.
  if (input.protectedTeeth.length) {
    // Teeth beside a band are always protected. Teeth facing it (the other arch, under the band's own
    // columns) are part of the edit where the band reaches them, since a longer tooth covers them, and
    // protected beyond it.
    const beside = new Uint8Array(w * h), facing = new Uint8Array(w * h);
    for (const outline of input.protectedTeeth) {
      const centre = Math.round(outline.reduce((sum, p) => sum + p[0], 0) / Math.max(1, outline.length));
      const target = band && centre >= 0 && centre < w && band.own[centre] ? facing : beside;
      const m = fillPolygon(outline, w, h);
      for (let i = 0; i < m.length; i++) if (m[i]) target[i] = 1;
    }
    const besideGuard = dilate(beside, w, h, 1), facingGuard = dilate(facing, w, h, 1);
    for (let i = 0; i < allowed.length; i++) if (besideGuard[i] || (facingGuard[i] && !(band && band.mask[i]))) allowed[i] = 0;
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

/** Moving minimum or maximum, then a moving average, over the defined span of a column profile. */
function smoothProfile(values: Float64Array, from: number, to: number, reach: number, soften: number, pick: (a: number, b: number) => number): Float64Array {
  const picked = new Float64Array(values);
  for (let x = from; x <= to; x++) {
    let v = values[x];
    for (let k = Math.max(from, x - reach); k <= Math.min(to, x + reach); k++) v = pick(v, values[k]);
    picked[x] = v;
  }
  const out = new Float64Array(picked);
  for (let x = from; x <= to; x++) {
    let sum = 0, n = 0;
    for (let k = Math.max(from, x - soften); k <= Math.min(to, x + soften); k++) { sum += picked[k]; n++; }
    out[x] = sum / n;
  }
  return out;
}

/**
 * One band per arch for the selected teeth that may change form: from a smooth line along their gum
 * margins to a smooth line past their incisal edges. `own` marks the columns under the teeth
 * themselves (not the small allowance either side).
 */
function archBands(selected: { outline: Point[]; rule: ToothEditRule }[], w: number, h: number): { mask: Uint8Array; own: Uint8Array } | null {
  const mask = new Uint8Array(w * h), own = new Uint8Array(w);
  let any = false;
  for (const direction of [1, -1] as const) {
    const teeth = selected.filter(t => !t.rule.exactOnly && t.outline.length >= 3 && (t.rule.direction ?? 1) === direction);
    if (!teeth.length) continue;
    const top = new Float64Array(w).fill(Number.NaN), bottom = new Float64Array(w).fill(Number.NaN);
    const widths: number[] = [], heights: number[] = [];
    for (const tooth of teeth) {
      const filled = fillPolygon(tooth.outline, w, h);
      const xs = tooth.outline.map(p => p[0]), ys = tooth.outline.map(p => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
      widths.push(x1 - x0); heights.push(y1 - y0);
      for (let x = x0; x <= x1; x++) {
        let first = -1, last = -1;
        for (let y = y0; y <= y1; y++) if (filled[y * w + x]) { if (first < 0) first = y; last = y; }
        if (first < 0) continue;
        top[x] = Number.isNaN(top[x]) ? first : Math.min(top[x], first);
        bottom[x] = Number.isNaN(bottom[x]) ? last : Math.max(bottom[x], last);
      }
    }
    let from = -1, to = -1;
    for (let x = 0; x < w; x++) if (!Number.isNaN(top[x])) { if (from < 0) from = x; to = x; }
    if (from < 0) continue;
    // Columns between teeth (contacts the detector stopped short of, or a tooth it missed) follow their neighbours.
    for (const line of [top, bottom]) {
      let last = from;
      for (let x = from + 1; x <= to; x++) {
        if (Number.isNaN(line[x])) continue;
        for (let k = last + 1; k < x; k++) line[k] = line[last] + ((line[x] - line[last]) * (k - last)) / (x - last);
        last = x;
      }
    }
    const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const width = Math.max(4, median(widths)), height = Math.max(4, median(heights));
    for (let x = from; x <= to; x++) own[x] = 1;
    // A little room either side for a wider end tooth, carried at the end tooth's own level.
    const side = Math.round(width * 0.12), start = Math.max(0, from - side), end = Math.min(w - 1, to + side);
    for (let x = start; x < from; x++) { top[x] = top[from]; bottom[x] = bottom[from]; }
    for (let x = to + 1; x <= end; x++) { top[x] = top[to]; bottom[x] = bottom[to]; }
    const reach = Math.max(1, Math.round(width * 0.5)), soften = Math.max(1, Math.round(width * 0.2));
    // Upper teeth: the gum margin is the upper line and they lengthen downwards. Lower teeth: the reverse.
    const growth = height * 0.45;
    const gum = direction === 1 ? smoothProfile(top, start, end, reach, soften, Math.min) : smoothProfile(bottom, start, end, reach, soften, Math.max);
    const edge = direction === 1 ? smoothProfile(bottom, start, end, reach, soften, Math.max) : smoothProfile(top, start, end, reach, soften, Math.min);
    for (let x = start; x <= end; x++) {
      const a = direction === 1 ? gum[x] : edge[x] - growth, b = direction === 1 ? edge[x] + growth : gum[x];
      for (let y = Math.max(0, Math.floor(a)); y <= Math.min(h - 1, Math.ceil(b)); y++) mask[y * w + x] = 1;
    }
    any = true;
  }
  return any ? { mask, own } : null;
}

/** Fill runs of 0 no longer than 2r between 1s on the same row. */
function closeRows(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      if (last >= 0 && x - last > 1 && x - last - 1 <= 2 * r) out.fill(1, row + last + 1, row + x);
      last = x;
    }
  }
  return out;
}

/** A narrow feather: a few pixels on a phone photo, never a wide blur. */
export function featherFor(teethWidthPx: number): number {
  return Math.max(1, Math.min(6, Math.round(teethWidthPx * 0.006)));
}

/** A band blends over a wider edge, so its boundary never reads as a cut line. */
export function bandFeatherFor(teethWidthPx: number): number {
  return Math.max(3, Math.min(14, Math.round(teethWidthPx * 0.014)));
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
