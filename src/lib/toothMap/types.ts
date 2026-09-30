import { upperTeeth, type SmileSettings, type TeethCount } from "../types";

/**
 * The SmileCompose Tooth Map: every visible tooth in the patient photo as its
 * own region, with a suggested FDI number the clinician can confirm or
 * correct. The rule it exists to enforce: if the clinician didn't select a
 * tooth, SmileCompose doesn't change it.
 *
 * Coordinates are normalised to the photo (0–1), so overlays stay correct at
 * any display size and masks can be rasterised at any resolution. Masks are
 * never stored as images: each is derived on demand from the tooth's outline.
 */
export type NormPoint = [number, number];

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ToothRegion {
  id: string;
  /** Suggested (or clinician-corrected) FDI number; null when unassigned. */
  fdi: number | null;
  /** Left-to-right order in the photo when detected. */
  detectedIndex: number;
  /** 0–1, internal only: never shown to patients. Null for a tooth the clinician added. */
  confidence: number | null;
  bbox: NormBox;
  centroid: { x: number; y: number };
  /** The tooth's outline in the photo; every mask is derived from it. */
  outline: NormPoint[];
  /** Identifies the tooth's exact mask, rasterised from its outline when needed. */
  exactMaskRef: string;
  /** Identifies its design-influence mask, derived from the outline and the treatment. */
  influenceMaskRef?: string;
  /** False when the clinician marks it missing or not applicable. */
  visible: boolean;
  /** Mirrors the design selection when the map is saved with a result (the settings decide). */
  selected: boolean;
  /** Low confidence: shown as "Check tooth 23" until the map is confirmed. */
  requiresReview: boolean;
  source: "detected" | "manual";
}

export interface ToothMap {
  /** Fingerprint of the photo this map belongs to; a different photo needs a new map. */
  photoId: string;
  arch: "upper" | "lower";
  teeth: ToothRegion[];
  confirmedByClinician: boolean;
  version: number;
  /** How the regions were found, so later methods (e.g. a segmentation model) can be told apart. */
  method: "on-device-v1" | "on-device-sam" | "manual";
  /** The mouth opening (inner lip contour) when a face was found: edits never leave it. */
  mouthOpening?: NormPoint[];
}

export const TOOTH_MAP_VERSION = 1;

/** Upper anterior convenience presets. They never assume a tooth is present or visible. */
export const TOOTH_PRESETS: Record<TeethCount, number[]> = upperTeeth;

/** A fast, stable fingerprint of a photo's data URL (FNV-1a over a sample of it). */
export function photoFingerprint(dataUrl: string): string {
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(dataUrl.length / 4096));
  for (let i = 0; i < dataUrl.length; i += step) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${dataUrl.length.toString(36)}-${hash.toString(36)}`;
}

/** Teeth the map can edit: visible, numbered regions. */
export function mappedTeeth(map: ToothMap | null | undefined): number[] {
  return (map?.teeth ?? []).filter(t => t.visible && t.fdi !== null).map(t => t.fdi as number);
}

/** Which of a preset's teeth this photo shows, and which it doesn't. */
export function presetAvailability(map: ToothMap | null | undefined, count: TeethCount): { found: number[]; notFound: number[] } {
  const present = new Set(mappedTeeth(map));
  const teeth = TOOTH_PRESETS[count];
  return { found: teeth.filter(t => present.has(t)), notFound: teeth.filter(t => !present.has(t)) };
}

/** The region for an FDI number, if the photo shows it. */
export function regionFor(map: ToothMap | null | undefined, fdi: number): ToothRegion | undefined {
  return map?.teeth.find(t => t.visible && t.fdi === fdi);
}

/** The map with `selected` set from the design (the settings are the one source of selection). */
export function withSelection(map: ToothMap, settings: Pick<SmileSettings, "selectedTeeth">): ToothMap {
  const selected = new Set(settings.selectedTeeth);
  return { ...map, teeth: map.teeth.map(t => ({ ...t, selected: t.visible && t.fdi !== null && selected.has(t.fdi) })) };
}

/** Teeth still to check before the map is confirmed. */
export function teethToReview(map: ToothMap | null | undefined): ToothRegion[] {
  if (!map || map.confirmedByClinician) return [];
  return map.teeth.filter(t => t.visible && t.requiresReview);
}

/** "13 · 12 · 11 · 21 · 22 · 23": in the patient's right-to-left order. */
export function fdiOrder(teeth: number[]): number[] {
  const rank = (fdi: number) => {
    const q = Math.floor(fdi / 10), n = fdi % 10;
    // Upper: 18…11 then 21…28; lower: 48…41 then 31…38.
    if (q === 1) return -n;
    if (q === 2) return n;
    if (q === 4) return 100 - n;
    return 100 + n;
  };
  return [...teeth].sort((a, b) => rank(a) - rank(b));
}

/** Change one tooth's number; a tooth already holding that number swaps to the old one. */
export function renumber(map: ToothMap, id: string, fdi: number | null): ToothMap {
  const target = map.teeth.find(t => t.id === id);
  if (!target) return map;
  const previous = target.fdi;
  return {
    ...map,
    teeth: map.teeth.map(t => {
      if (t.id === id) return { ...t, fdi, requiresReview: false };
      if (fdi !== null && t.fdi === fdi) return { ...t, fdi: previous };
      return t;
    }),
  };
}

export function isValidToothMap(value: unknown): value is ToothMap {
  const m = value as ToothMap;
  const point = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && (n as number) >= -0.01 && (n as number) <= 1.01);
  return Boolean(m) && typeof m.photoId === "string" && (m.arch === "upper" || m.arch === "lower") && Array.isArray(m.teeth) && m.teeth.length <= 32
    && typeof m.confirmedByClinician === "boolean" && Number.isInteger(m.version)
    && (m.mouthOpening === undefined || (Array.isArray(m.mouthOpening) && m.mouthOpening.every(point)))
    && m.teeth.every(t => typeof t?.id === "string" && (t.fdi === null || Number.isInteger(t.fdi)) && Array.isArray(t.outline)
      && t.outline.length >= 3 && t.outline.length <= 256 && t.outline.every(point) && typeof t.visible === "boolean");
}
