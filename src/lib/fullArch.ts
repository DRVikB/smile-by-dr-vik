import { DEFAULT_FULL_ARCH, type FullArchPlan, type SmileSettings } from "./types";

/**
 * Full-arch is an exclusive treatment mode: choosing it turns straightening
 * off and sets aside the restorative material and per-tooth plan (kept, but
 * not used, so switching back restores them). V1 always uses both visible
 * arches and zirconia; historical case records remain unchanged.
 */
export function chooseFullArch(s: SmileSettings, patch: Partial<FullArchPlan> = {}): SmileSettings {
  const base: FullArchPlan = s.fullArch ?? DEFAULT_FULL_ARCH;
  return { ...s, treatmentMode: "full_arch", fullArch: { ...base, ...patch, arch: "both", restorationType: "zirconia" }, alignment: undefined, whitening: undefined };
}

/** Any standard treatment choice (material, straightening) leaves full-arch mode. */
export function chooseStandard(s: SmileSettings, patch: Partial<SmileSettings> = {}): SmileSettings {
  return { ...s, ...patch, treatmentMode: "standard" };
}

/** Selecting Alignment starts a visual position-only concept, never silently
 * applies the remembered restorative material or shade. */
export function chooseAlignment(s: SmileSettings): SmileSettings {
  return chooseStandard(s, { alignment: { arches: "Both", only: true }, whitening: undefined });
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

export type StandardTreatmentChoice = "Whitening" | "Veneers" | "Alignment";

/** Derive the checked treatments from compatible historical settings. */
export function selectedTreatments(s: SmileSettings): StandardTreatmentChoice[] {
  if (s.treatmentMode === "full_arch") return [];
  if (s.alignment?.only) return ["Alignment"];
  return [
    ...(s.treatment === "Whitening" || s.whitening ? ["Whitening" as const] : []),
    ...(s.treatment !== "Whitening" ? ["Veneers" as const] : []),
    ...(s.alignment ? ["Alignment" as const] : []),
  ];
}

/** One or more standard treatments; full arch remains exclusive. Keep the
 * existing tooth, material, shade and design settings whenever they apply. */
export function toggleTreatment(s: SmileSettings, choice: StandardTreatmentChoice): SmileSettings {
  const selected = new Set(selectedTreatments(s));
  if (selected.has(choice)) selected.delete(choice); else selected.add(choice);
  if (!selected.size) return s; // At least one treatment is required.
  if (selected.size === 1 && selected.has("Alignment")) return chooseAlignment(s);
  const veneers = selected.has("Veneers");
  return chooseStandard(s, {
    treatment: veneers ? (s.treatment === "Whitening" ? "Layered composite" : s.treatment) : "Whitening",
    whitening: veneers && selected.has("Whitening") ? true : undefined,
    alignment: selected.has("Alignment") ? { arches: "Both" } : undefined,
  });
}

/** Clinician-facing summary including every checked treatment. */
export function standardTreatmentSummary(s: SmileSettings, material: string = s.treatment): string {
  return selectedTreatments(s).map(choice => choice === "Veneers" ? material : choice).join(" + ");
}
