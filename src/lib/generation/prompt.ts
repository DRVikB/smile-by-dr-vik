import type { Framing, SmileSettings } from "../types";

const percent = (value: number) => Math.round(value * 100);

/**
 * Accepted smile-design proportions. Without these the model reliably returns
 * teeth that read as too large: levelled edges, closed embrasures and a tooth
 * footprint wider and longer than the patient's own.
 */
const DESIGN_PRINCIPLES = [
  "Follow established smile-design proportions so the result reads as a refinement of this patient's own teeth rather than a larger set placed over them.",
  "Stay inside the existing footprint: do not widen, lengthen or extend any tooth beyond the outline of the tooth already there, past the lower lip line, or into the buccal corridors at the corners of the smile.",
  "Keep each central incisor's apparent width at roughly 75-85% of its length, so a central never reads as wider than it is tall.",
  "Preserve the width progression from the midline outwards: each lateral incisor appears narrower than the central beside it, and each canine narrower again.",
  "Keep the lateral incisal edges slightly shorter than the centrals, and never level every incisal edge into one straight line.",
  "Follow the smile arc, with the curve of the upper incisal edges running roughly parallel to the curve of the lower lip.",
  "Keep the incisal embrasures open between the teeth, opening progressively from the midline outwards.",
  "Preserve the dental midline, the gingival zenith positions and the existing gingival margin heights exactly.",
  "A brighter shade makes teeth read larger, so when brightening do not let their apparent size grow.",
].join(" ");

/**
 * Facial harmony. The clinician names the facial outline (or leaves it on Auto
 * and lets the model read it) and the character they want; these map onto the
 * classical face-shape / tooth-form relationship and the reference smile lines.
 */
const FACE_SHAPE_GUIDANCE: Record<string, string> = {
  Auto: "Read the patient's facial outline from the photograph and harmonise the tooth form with it, following the classical relationship in which the outline of the upper central incisor echoes the outline of the face.",
  Square: "The patient's facial outline is square, with a broad forehead and a strong, wide jawline. Harmonise the tooth form with it: centrals with relatively parallel proximal walls, a fuller incisal third and only lightly rounded incisal corners, so the smile carries the width of the face.",
  Ovoid: "The patient's facial outline is ovoid, widest at the cheekbones and curving in gently above and below. Harmonise the tooth form with it: centrals with gently curved proximal walls and softly rounded incisal corners, without flattening into a square outline.",
  Tapering: "The patient's facial outline is tapering, wider at the temples and narrowing towards the chin. Harmonise the tooth form with it: centrals narrowing towards the gingival third with converging proximal walls and a slightly wider incisal third, so the tooth outline echoes the taper of the face.",
};

const CHARACTER_GUIDANCE: Record<string, string> = {
  Soft: "Give the smile a soft character: rounded incisal corners, open incisal embrasures, a slightly more prominent curve to the smile arc, and canines with a softened, rounded cusp tip rather than a sharp point.",
  Balanced: "Give the smile a balanced character: incisal corners neither sharply angular nor fully rounded, moderate embrasures, and a canine tip with gentle definition.",
  Defined: "Give the smile a defined character: flatter incisal edges with more distinct line angles, slightly tighter embrasures, a more prominent canine tip and a stronger, more horizontal incisal plane.",
};

/** Reference smile lines the design should sit on. */
const SMILE_LINES = [
  "Keep the dental midline coincident with the facial midline and vertical; if the existing dental midline is already coincident, do not move it.",
  "Keep the incisal plane parallel to the interpupillary line, not to a tilted camera or a tilted head.",
  "Run the smile arc so the curve of the upper incisal edges follows the curve of the lower lip, touching or running just clear of it, and never reverses into an upward curve.",
  "Keep the buccal corridors as photographed: do not fill the dark spaces at the corners of the smile with extra or widened teeth.",
].join(" ");

/** How to treat what is already in the mouth. */
const EXISTING_DENTITION = [
  "Work from the dentition actually visible in the photograph. Keep each tooth in its existing position, rotation and inclination within the arch, and keep the existing arch form.",
  "Refine existing wear, chipping, irregular edges and minor crowding rather than replacing the teeth with an idealised row.",
  "Where a tooth is missing, fractured or heavily broken down, rebuild it to match its contralateral partner in width, length and form so the two sides read as a pair.",
  "Where the teeth are already well proportioned, change very little; the result should be recognisable to the patient as their own smile.",
].join(" ");

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

  const smileLines =
    s.shotType === "Close-up"
      ? SMILE_LINES.replace(
          "Keep the incisal plane parallel to the interpupillary line, not to a tilted camera or a tilted head. ",
          "",
        )
      : SMILE_LINES;

  const harmony = `${FACE_SHAPE_GUIDANCE[s.faceShape] ?? FACE_SHAPE_GUIDANCE.Auto} ${
    CHARACTER_GUIDANCE[s.character] ?? CHARACTER_GUIDANCE.Balanced
  } ${smileLines} ${EXISTING_DENTITION}`;

  return `Create a photorealistic cosmetic dentistry communication preview from the provided photograph. Modify only ${s.teeth} upper anterior teeth, symmetrically around the midline (FDI tooth numbers: ${s.selectedTeeth.join(", ")}). Treatment material: ${s.treatment}. ${shade} Tooth morphology: ${s.shape}. ${texture} Transformation intensity: ${s.intensity}/100. This governs how far the result may move from the original tooth form: at low values refine the existing teeth only — tidy the edges and adjust shade while leaving size, width and length close to the original; at high values a more designed result is acceptable, but every proportion rule still applies. ${DESIGN_PRINCIPLES} ${harmony} ${framing} Keep all untreated teeth exactly. Do not edit the gingiva; if the requested result would require gingival editing, reduce the tooth changes instead. Preserve realistic enamel translucency, interdental contacts and individual character. Avoid CGI, flat opaque white teeth, a uniform denture-like row, chiclet-shaped teeth, and any result whose teeth look larger, wider or longer than the patient\u2019s own.${region}${reference}${notes} Return only the edited photograph at exactly the same pixel dimensions, framing, scale, rotation and crop as the input, aligned so the original and the edit can be compared with a before-and-after slider. Do not zoom, pan, straighten, re-crop, mirror, or change the size or position of the face, lips or teeth within the frame.`;
}
