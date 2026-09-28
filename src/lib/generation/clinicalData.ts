import type { SmileSettings } from "../types";

/** Compact clinician facts accompany the existing image request; no extra AI pass. */
export function clinicalDataInstruction(settings: SmileSettings): string {
  const data = settings.clinicalData;
  const facts = data ? [
    data.overbiteMm !== undefined ? `Measured overbite: ${data.overbiteMm} mm.` : "",
    data.overjetMm !== undefined ? `Measured overjet: ${data.overjetMm} mm.` : "",
    data.restorativeSpace && data.restorativeSpace !== "Not assessed" ? `Restorative space assessment: ${data.restorativeSpace}.` : "",
    data.constraints?.trim() ? `Clinical constraints: ${JSON.stringify(data.constraints.trim())}.` : "",
    data.patientPriorities?.trim() ? `Patient priorities (subordinate to clinical constraints): ${JSON.stringify(data.patientPriorities.trim())}.` : "",
  ].filter(Boolean).join(" ") : "";
  return [
    "PHOTO REVIEW: Before editing, inspect visible tooth proportions, incisal steps, wear, gaps, both arches, gum contours, lip coverage and smile curvature. Distinguish visible observations from unknown anatomy. Preserve features already balanced; the most appropriate improvement may be shade alone or very little visible change. Do not maximise the size or uniformity of the smile to create a more dramatic before/after.",
    facts ? `CLINICIAN DATA: ${facts} These are clinician-supplied observations, not measurements inferred from the image. Use them as constraints on permitted edits, not as new permissions or proof of feasibility. Clinical prohibitions take precedence over aesthetic preferences; if they conflict with a requested change, preserve that feature. Do not convert an overbite/overjet value into pixel movement or assume missing measurements are zero. "Assessed for planned changes" only refers to the clinician's specified plan, not all possible additions.` : "",
    data?.restorativeSpace === "Limited / uncertain" ? "SPACE RESTRICTION: Do not add incisal length or posterior height while restorative space is limited or uncertain. Retain those edges even if a shape or smile-arc preference would change them." : "",
    "RESULT REVIEW: Compare the proposed image with the original and the supplied constraints before returning it. Retain untreated teeth, the existing bite relationship, gums and lips. Do not treat visual attractiveness as evidence of bite correction or claim clinical validation.",
  ].filter(Boolean).join(" ");
}
