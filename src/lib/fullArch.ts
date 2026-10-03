import { DEFAULT_FULL_ARCH, type FullArchPlan, type SmileSettings } from "./types";

/**
 * Full-arch is an exclusive treatment mode: choosing it turns straightening
 * off and sets aside the restorative material and per-tooth plan (kept, but
 * not used, so switching back restores them). The arch defaults to whatever
 * the case already names.
 */
export function chooseFullArch(s: SmileSettings, patch: Partial<FullArchPlan> = {}): SmileSettings {
  const fromAlignment: FullArchPlan["arch"] | undefined = s.alignment ? (s.alignment.arches === "Both" ? "both" : s.alignment.arches === "Lower" ? "lower" : "upper") : undefined;
  const base: FullArchPlan = s.fullArch ?? { ...DEFAULT_FULL_ARCH, arch: fromAlignment ?? DEFAULT_FULL_ARCH.arch };
  return { ...s, treatmentMode: "full_arch", fullArch: { ...base, ...patch }, alignment: undefined };
}

/** Any standard treatment choice (material, straightening) leaves full-arch mode. */
export function chooseStandard(s: SmileSettings, patch: Partial<SmileSettings> = {}): SmileSettings {
  return { ...s, ...patch, treatmentMode: "standard" };
}

/** Selecting Alignment starts a visual position-only concept, never silently
 * applies the remembered restorative material or shade. */
export function chooseAlignment(s: SmileSettings): SmileSettings {
  return chooseStandard(s, { alignment: { arches: s.alignment?.arches ?? "Upper", only: true } });
}
