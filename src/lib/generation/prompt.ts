import type { SmileSettings } from "../types";

export function buildSmileInstruction(
  s: SmileSettings,
  hasReference = false,
): string {
  const texture =
    s.texture === "Textured"
      ? "Add pronounced natural surface characterisation: visible secondary anatomy (developmental lobes and mamelons, subtle perikymata and surface micro-texture) and distinct incisal translucency with a translucent incisal edge and halo."
      : s.texture === "Smooth"
        ? "Keep a smooth, minimally textured enamel surface with only slight incisal translucency."
        : "Keep realistic natural surface texture with subtle secondary anatomy and gentle incisal translucency.";

  const framing =
    s.shotType === "Close-up"
      ? "This is a close-up, retracted or smile-only photograph. Preserve the lips, gingiva and any visible soft tissue, the lighting and the framing exactly; there may be no full face in view, so do not invent facial features."
      : "Preserve facial identity, facial proportions, lips, skin, gingiva, background, pose, camera framing and lighting exactly.";

  const reference = hasReference
    ? " A separate reference image is also provided; use it only as a visual guide for the desired tooth shape, proportion and shade — do not copy the reference person's identity, lips, skin or face."
    : "";

  const notes =
    s.notes && s.notes.trim()
      ? ` Additional clinician instruction, to follow within all of the above constraints: ${s.notes.trim()}.`
      : "";

  return `Create a photorealistic cosmetic dentistry communication preview from the provided photograph. Modify only ${s.teeth} upper anterior teeth, symmetrically around the midline (FDI tooth numbers: ${s.selectedTeeth.join(", ")}). Treatment material: ${s.treatment}. Dentist-selected current shade: ${s.currentShade}; requested target shade: ${s.targetShade}. This is a supplied shade reference, not a diagnosis from the photograph. Tooth morphology: ${s.shape}. ${texture} Transformation intensity: ${s.intensity}/100, where 0 is subtle and natural, and 100 is more enhanced while remaining anatomically believable. ${framing} Keep all untreated teeth exactly. Do not edit the gingiva; if the requested result would require gingival editing, reduce the tooth changes instead. Preserve realistic enamel translucency, interdental contacts and individual character. Avoid CGI, flat opaque white teeth, excessive uniformity and unnatural proportions.${reference}${notes} Return only the edited photograph at the same aspect ratio and composition.`;
}
