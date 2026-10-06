import type { SmileSettings } from "../types";
import { GUIDE_TEETH, guideFrame, type SmileGuide } from "./frame";

/*
 * One-tooth design: a chipped, worn or missing upper front tooth is redrawn by
 * the image service to match its partner across the midline and the teeth
 * beside it. The smile guide's measured boundaries give the tooth's region:
 * it guides the image service, and afterwards only that region is taken from
 * the result, so no other tooth, gum or lip can change.
 */

export const MATCH_TEETH = [11, 12, 13, 21, 22, 23] as const;
export type MatchTooth = typeof MATCH_TEETH[number];
export interface ToothMatch { tooth: MatchTooth; missing: boolean }

export const isMatchTooth = (fdi: number): fdi is MatchTooth => (MATCH_TEETH as readonly number[]).includes(fdi);
/** The same tooth on the other side: UR1 ↔ UL1. */
export const partnerOf = (fdi: MatchTooth): MatchTooth => (fdi < 20 ? fdi + 10 : fdi - 10) as MatchTooth;
/** UK (Palmer) name, as clinicians say it: 11 is UR1, 22 is UL2. */
export const toothLabel = (fdi: number) => `U${fdi < 20 ? "R" : "L"}${fdi % 10}`;
export const toothKind = (fdi: number) => (["central incisor", "lateral incisor", "canine"] as const)[(fdi % 10) - 1];
/** The neighbouring front teeth on each side. */
export const neighboursOf = (fdi: MatchTooth): number[] => {
  const k = GUIDE_TEETH.indexOf(fdi);
  return [GUIDE_TEETH[k - 1], GUIDE_TEETH[k + 1]].filter((t): t is number => t !== undefined);
};

/** One-tooth design applies to a restorative design, not with alignment or full arch. */
export function isToothMatch(s: SmileSettings): s is SmileSettings & { toothMatch: ToothMatch } {
  return Boolean(s.toothMatch) && !s.alignment && s.treatmentMode !== "full_arch" && s.treatment !== "Whitening";
}

/** Settings for designing one tooth: it is the only tooth the design changes. */
export function withToothMatch(s: SmileSettings, match: ToothMatch): SmileSettings {
  return {
    ...s, toothMatch: match, selectedTeeth: [match.tooth],
    toothPlans: [{ tooth: match.tooth, intent: match.missing ? "Close gaps" : "Repair edges", condition: "Natural" }],
  };
}

export function matchSummary(m: ToothMatch): string {
  const partner = partnerOf(m.tooth);
  return m.missing ? `Missing ${toothLabel(m.tooth)} added to match ${toothLabel(partner)}` : `${toothLabel(m.tooth)} rebuilt to match ${toothLabel(partner)}`;
}

/** A whiter shade with one-tooth design whitens every visible tooth on the device afterwards, so the pair still match. */
export const matchWhitens = (s: SmileSettings) => isToothMatch(s) && s.targetShade !== "The same";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ramp = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

/**
 * The tooth's region, 0–1 per pixel of a `w`×`h` image the guide is fitted to:
 * between its boundaries (easing over the neighbours' edges), from the lip or
 * gum line down past the longer of its own edge and its partner's, so a chipped
 * tooth can regain its partner's length. `opening` (1 inside the lips) keeps the
 * lips out.
 */
export function toothRegion(w: number, h: number, guide: SmileGuide, { tooth, missing }: ToothMatch, opening: Uint8Array | null): Float32Array {
  const f = guideFrame(guide);
  const k = GUIDE_TEETH.indexOf(tooth), s = GUIDE_TEETH.indexOf(partnerOf(tooth));
  const [at, bt] = [f.divisions[k], f.divisions[k + 1]], [as, bs] = [f.divisions[s], f.divisions[s + 1]];
  const target = f.teeth[k], source = f.teeth[s];
  const alpha = new Float32Array(w * h);
  const width = bt - at, height = source.centreBottom - source.centreTop;
  if (!(width > 0) || !(height > 0)) return alpha;
  // The partner's length, carried to this tooth (mesial to mesial, across the midline).
  const toSource = (u: number) => { const t = k >= 3 ? (u - at) / width : (bt - u) / width; return s >= 3 ? as + t * (bs - as) : bs - t * (bs - as); };
  const lift = f.gum((as + bs) / 2) - f.gum((at + bt) / 2);
  const edgeAt = (u: number) => Math.max(missing ? -Infinity : target.bottom(u), source.bottom(toSource(u)) - lift);
  // A missing tooth's space runs up to the lip; an existing tooth keeps its own gum line.
  const topAt = (u: number) => (missing ? Math.min(target.top(u), source.top(toSource(u)) - lift) - height * 0.35 : target.top(u) - height * 0.08);
  const side = width * 0.16, below = height * 0.12, ease = height * 0.08;
  const corners = [[at - side, topAt(at) - ease], [bt + side, topAt(bt) - ease], [at - side, edgeAt(at) + below], [bt + side, edgeAt(bt) + below]].map(([u, y]) => f.toPhoto(u, y));
  const x0 = clamp(Math.floor(Math.min(...corners.map(p => p[0]))), 0, w - 1), x1 = clamp(Math.ceil(Math.max(...corners.map(p => p[0]))), 0, w - 1);
  const y0 = clamp(Math.floor(Math.min(...corners.map(p => p[1]))), 0, h - 1), y1 = clamp(Math.ceil(Math.max(...corners.map(p => p[1]))), 0, h - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x;
    if (opening && !opening[i]) continue;
    const [u, v] = f.toGuide(x, y);
    const across = ramp((u - (at - side / 2)) / side) * ramp((bt + side / 2 - u) / side);
    if (across <= 0) continue;
    const top = topAt(u), bottom = edgeAt(u) + below;
    alpha[i] = across * ramp((v - (top - ease)) / ease) * ramp((bottom - v) / below);
  }
  return alpha;
}

/** Only the tooth's region comes from the result; everything else is the original photograph. */
export function keepToothRegion(original: Uint8ClampedArray, result: Uint8ClampedArray, alpha: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(original);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const p = i * 4;
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(original[p + c] * (1 - a) + result[p + c] * a);
  }
  return out;
}
