import { DEFAULT_FULL_ARCH, type FullArchPlan, type SmileSettings } from "./types";

/**
 * Full-arch is an exclusive treatment mode: choosing it turns straightening
 * off and sets aside the restorative material and per-tooth plan (kept, but
 * not used, so switching back restores them). V1 always uses both visible
 * arches and zirconia; historical case records remain unchanged.
 */
export function chooseFullArch(s: SmileSettings, patch: Partial<FullArchPlan> = {}): SmileSettings {
  const base: FullArchPlan = s.fullArch ?? DEFAULT_FULL_ARCH;
  return { ...s, treatmentMode: "full_arch", fullArch: { ...base, ...patch, arch: "both", restorationType: "zirconia" }, alignment: undefined };
}

/** Any standard treatment choice (material, straightening) leaves full-arch mode. */
export function chooseStandard(s: SmileSettings, patch: Partial<SmileSettings> = {}): SmileSettings {
  return { ...s, ...patch, treatmentMode: "standard" };
}

/** Selecting Alignment starts a visual position-only concept, never silently
 * applies the remembered restorative material or shade. */
export function chooseAlignment(s: SmileSettings): SmileSettings {
  return chooseStandard(s, { alignment: { arches: "Both", only: true } });
}

/** New alignment concepts always cover both visible arches. Historical case
 * records stay intact; normalise only editable/new generation state. */
export function normalizeAlignmentScope(s: SmileSettings): SmileSettings {
  return s.alignment && s.alignment.arches !== "Both"
    ? { ...s, alignment: { ...s.alignment, arches: "Both" } }
    : s;
}

/** Normalize editable/request state only, never the saved historical settings. */
export function normalizeTreatmentScope(s: SmileSettings): SmileSettings {
  return s.treatmentMode === "full_arch" ? chooseFullArch(s) : normalizeAlignmentScope(s);
}
