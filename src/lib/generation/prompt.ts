import type { Framing, SmileSettings } from "../types";

const percent = (value: number) => Math.round(value * 100);

export function buildSmileInstruction(
  s: SmileSettings,
  hasReference = false,
  capture?: Framing,
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

  const region = capture
    ? ` The photograph was captured with the smile aligned to an on-screen guide, so the teeth sit roughly between ${percent(capture.x)}% and ${percent(capture.x + capture.width)}% across the frame and ${percent(capture.y)}% to ${percent(capture.y + capture.height)}% down it. Confine every change to the teeth inside that region and leave every pixel outside it untouched.`
    : "";

  const notes =
    s.notes && s.notes.trim()
      ? ` Additional clinician instruction, to follow within all of the above constraints: ${s.notes.trim()}.`
      : "";

  const shade = s.targetShade === "The same"
    ? "Preserve the original tooth colour and shade exactly as photographed. Do not whiten or brighten the teeth, regardless of transformation intensity or reference photo shade."
    : s.targetShade === "Whiten"
      ? "Gently whiten the selected teeth relative to their original appearance for a brighter, natural shade. Retain subtle warmth and translucency; avoid a stark bleached white."
      : s.targetShade === "Bleach"
        ? "Give the selected teeth a noticeably brighter bleached-white shade, while retaining realistic enamel depth, translucency and natural shading."
        : `Dentist-selected current shade: ${s.currentShade}; requested target shade: ${s.targetShade}. This is a supplied shade reference, not a diagnosis from the photograph.`;

  return `Create a photorealistic cosmetic dentistry communication preview from the provided photograph. Modify only ${s.teeth} upper anterior teeth, symmetrically around the midline (FDI tooth numbers: ${s.selectedTeeth.join(", ")}). Treatment material: ${s.treatment}. ${shade} Tooth morphology: ${s.shape}. ${texture} Transformation intensity: ${s.intensity}/100, where 0 is subtle and natural, and 100 is more enhanced while remaining anatomically believable. ${framing} Keep all untreated teeth exactly. Do not edit the gingiva; if the requested result would require gingival editing, reduce the tooth changes instead. Preserve realistic enamel translucency, interdental contacts and individual character. Avoid CGI, flat opaque white teeth, excessive uniformity and unnatural proportions.${region}${reference}${notes} Return only the edited photograph at exactly the same pixel dimensions, framing, scale, rotation and crop as the input, aligned so the original and the edit can be compared with a before-and-after slider. Do not zoom, pan, straighten, re-crop, mirror, or change the size or position of the face, lips or teeth within the frame.`;
}
