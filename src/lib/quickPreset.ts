import { upperTeeth, type SmileSettings, type TeethCount } from "./types";
import { chooseAlignment, chooseStandard } from "./fullArch";

/**
 * My preset: one saved combination on the photo step that generates in one tap
 * (for example both arches, straightened, bleach white, layered bonding on 8
 * teeth). Kept on this device. "Most used" builds the same thing from the
 * combinations this clinician has actually generated here.
 */
export type PresetRestoration = "none" | "Single-shade composite" | "Layered composite" | "Porcelain";
export type PresetWhitening = "none" | "Whiten" | "Bleach";

export interface QuickPreset {
  arches: "upper" | "both";
  straighten: boolean;
  whitening: PresetWhitening;
  restoration: PresetRestoration;
  teeth: TeethCount;
}

export interface PresetChoice {
  source: "mine" | "most-used";
  preset: QuickPreset;
}

const CHOICE_KEY = "smile.quick-preset";
const USAGE_KEY = "smile.quick-preset.usage";
/** "Most used" is offered once this many designs have been counted. */
export const MOST_USED_MINIMUM = 5;
const TEETH: TeethCount[] = [4, 6, 8, 10];

export const DEFAULT_PRESET: QuickPreset = { arches: "upper", straighten: false, whitening: "Whiten", restoration: "Layered composite", teeth: 8 };

/** At least one treatment, so a preset always changes something. */
export const presetIsEmpty = (p: QuickPreset) => !p.straighten && p.whitening === "none" && p.restoration === "none";

function valid(p: unknown): p is QuickPreset {
  if (!p || typeof p !== "object") return false;
  const v = p as Record<string, unknown>;
  return (v.arches === "upper" || v.arches === "both")
    && typeof v.straighten === "boolean"
    && (v.whitening === "none" || v.whitening === "Whiten" || v.whitening === "Bleach")
    && (v.restoration === "none" || v.restoration === "Single-shade composite" || v.restoration === "Layered composite" || v.restoration === "Porcelain")
    && TEETH.includes(v.teeth as TeethCount)
    && !presetIsEmpty(v as unknown as QuickPreset);
}

export function readPresetChoice(): PresetChoice | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null");
    if (raw && (raw.source === "mine" || raw.source === "most-used") && valid(raw.preset)) return raw;
  } catch { /* unreadable: treated as not set */ }
  return null;
}

export function savePresetChoice(choice: PresetChoice) {
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode: kept for this visit only */ }
}

/** The preset that settings describe, or null for designs a preset can't express (full arch, one tooth, custom tooth plans). */
export function presetFromSettings(s: SmileSettings): QuickPreset | null {
  if (s.treatmentMode === "full_arch" || s.toothMatch || s.toothPlans?.length) return null;
  const restorative = s.treatment !== "Whitening" && !s.alignment?.only;
  const restoration: PresetRestoration = !restorative || s.treatment === "Whitening" ? "none" : s.treatment === "Composite" ? "Single-shade composite" : s.treatment;
  const whitens = s.treatment === "Whitening" || Boolean(s.whitening);
  const whitening: PresetWhitening = !whitens ? "none" : s.targetShade === "Bleach" ? "Bleach" : "Whiten";
  const preset: QuickPreset = {
    arches: s.lowerTeeth && restorative ? "both" : s.alignment ? "both" : "upper",
    straighten: Boolean(s.alignment),
    whitening,
    restoration,
    teeth: TEETH.includes(s.teeth) ? s.teeth : 8,
  };
  return presetIsEmpty(preset) ? null : preset;
}

/** The design a preset asks for, built on the clinician's other preferences (shape, texture, style). */
export function presetSettings(p: QuickPreset, current: SmileSettings): SmileSettings {
  const base: SmileSettings = { ...current, toothMatch: undefined, toothPlans: undefined, teeth: p.teeth, selectedTeeth: upperTeeth[p.teeth], lowerTeeth: undefined };
  const shade = p.whitening === "Bleach" ? "Bleach" : p.whitening === "Whiten" ? "Whiten" : current.targetShade;
  const alignment = p.straighten ? { arches: "Both" as const } : undefined;
  if (p.restoration === "none" && p.whitening === "none") return chooseAlignment(base);
  if (p.restoration === "none") return chooseStandard(base, { treatment: "Whitening", whitening: undefined, alignment, targetShade: shade });
  return chooseStandard(base, {
    treatment: p.restoration,
    whitening: p.whitening !== "none" ? true : undefined,
    alignment,
    targetShade: shade,
    lowerTeeth: p.arches === "both" ? true : undefined,
    designIntent: current.designIntent ?? "Auto",
  });
}

/** "Upper and lower · Straighten · Bleach · Layered bonding · 8 teeth" */
export function presetSummary(p: QuickPreset): string {
  const restoration = { none: "", "Single-shade composite": "Bonding", "Layered composite": "Layered bonding", Porcelain: "Porcelain veneers" }[p.restoration];
  return [
    p.arches === "both" ? "Upper and lower" : "Upper",
    p.straighten && "Straighten",
    p.whitening === "Bleach" ? "Bleach white" : p.whitening === "Whiten" && "Whiten",
    restoration,
    p.restoration !== "none" && `${p.teeth} teeth`,
  ].filter(Boolean).join(" · ");
}

/** The tile's shorter line: "Both arches · Straighten · Bleach · 8 layered bonding" */
export function presetShortSummary(p: QuickPreset): string {
  const restoration = { none: "", "Single-shade composite": "bonding", "Layered composite": "layered bonding", Porcelain: "porcelain veneers" }[p.restoration];
  return [
    p.restoration !== "none" && (p.arches === "both" ? "Both arches" : "Upper"),
    p.straighten && "Straighten",
    p.whitening !== "none" && p.whitening,
    restoration && `${p.teeth} ${restoration}`,
  ].filter(Boolean).join(" · ");
}

const keyOf = (p: QuickPreset) => JSON.stringify([p.arches, p.straighten, p.whitening, p.restoration, p.teeth]);

function readUsage(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch { return {}; }
}

/** Counts each finished design's combination (on this device only; no patient data). */
export function recordPresetUse(s: SmileSettings) {
  const preset = presetFromSettings(s);
  if (!preset) return;
  const usage = readUsage();
  const key = keyOf(preset);
  usage[key] = (usage[key] ?? 0) + 1;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch { /* private mode */ }
}

/** The most generated combination, once enough designs have been counted. */
export function mostUsedPreset(usage: Record<string, number> = readUsage()): { preset: QuickPreset; designs: number } | null {
  const total = Object.values(usage).reduce((a, b) => a + (Number(b) || 0), 0);
  if (total < MOST_USED_MINIMUM) return null;
  let best: { preset: QuickPreset; count: number } | null = null;
  for (const [key, count] of Object.entries(usage)) {
    try {
      const [arches, straighten, whitening, restoration, teeth] = JSON.parse(key);
      const preset = { arches, straighten, whitening, restoration, teeth };
      if (valid(preset) && (!best || count > best.count)) best = { preset, count };
    } catch { /* skip */ }
  }
  return best ? { preset: best.preset, designs: total } : null;
}

/** What the tile generates now: "Most used" follows the latest counts. */
export function activePreset(choice: PresetChoice | null): QuickPreset | null {
  if (!choice) return null;
  return choice.source === "most-used" ? (mostUsedPreset()?.preset ?? choice.preset) : choice.preset;
}
