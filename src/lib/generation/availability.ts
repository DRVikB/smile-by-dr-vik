import type { SmileSettings } from "../types";
import { activeToothPlans } from "../teeth";

/** Existing build-time gates; alignment/full arch are public unless explicitly disabled.
 * Single tooth remains opt-in. These are not an authorization boundary. */
export const INTERNAL_SINGLE_TOOTH = process.env.NEXT_PUBLIC_SMILE_INTERNAL_SINGLE_TOOTH === "1";
export const INTERNAL_ALIGNMENT = process.env.NEXT_PUBLIC_SMILE_INTERNAL_ALIGNMENT !== "0";
export const INTERNAL_FULL_ARCH = process.env.NEXT_PUBLIC_SMILE_INTERNAL_FULL_ARCH !== "0";
export const SINGLE_TOOTH_UNAVAILABLE = "Single-tooth design is not available in this version.";
export interface GenerationFeatures { singleTooth: boolean; alignment: boolean; fullArch: boolean }
const clientFeatures: GenerationFeatures = { singleTooth: INTERNAL_SINGLE_TOOTH, alignment: INTERNAL_ALIGNMENT, fullArch: INTERNAL_FULL_ARCH };

/** Read-only: legacy cases remain viewable/exportable with their original settings. */
export function generationUnavailable(settings: SmileSettings, features: GenerationFeatures = clientFeatures): string | null {
  if (!features.fullArch && settings.treatmentMode === "full_arch") return "Full-arch design is not available in this version.";
  if (!features.alignment && settings.alignment) return "Alignment design is not available in this version.";
  if (!features.singleTooth && settings.treatmentMode !== "full_arch" && !settings.alignment?.only && activeToothPlans(settings).length === 1)
    return SINGLE_TOOTH_UNAVAILABLE;
  return null;
}
