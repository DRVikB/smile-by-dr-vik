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

/**
 * Absolute, patient-specific scale. The rules above stop a single tooth
 * being oversized relative to its neighbours; these stop the whole smile
 * being oversized relative to the patient's own face, lips and age.
 */
const NATURAL_SCALE_GUIDANCE = [
  "Anchor the overall scale of the result to this patient's own face, not to a generic ideal: the combined width of the upper anterior teeth being edited must not end up wider than the distance between the corners of the mouth (the commissures) as photographed in this smile.",
  "Do not increase how much tooth shows between the lips beyond what this photograph already shows at this smile. Match the existing lip line, tooth display and gingival show; a fuller or more youthful display is not the goal unless the clinician's notes ask for it.",
  "Read the patient's apparent age from the photograph and let it temper the design: an older patient keeps shorter, slightly less uniform incisal edges and less tooth display than a much younger patient would carry. Do not apply a uniformly youthful, elongated result to an older face.",
  "These size and display limits hold at every transformation intensity, including the highest: a bigger, longer or more prominent tooth is never itself an improvement, and must never be how the result reads as more finished.",
].join(" ");

/**
 * What actually reads as "photo", not "edit": how the new pixels sit
 * against the ones around them, not just the tooth shapes themselves.
 */
const REALISM_GUIDANCE = [
  "Blend the edited region into the photograph seamlessly: match the grain, sharpness, colour temperature and micro-contrast of the surrounding, unedited pixels exactly at the boundary, so there is no visible seam, halo or change in noise level where the edit ends.",
  "Keep the soft shadow the upper lip casts onto the teeth, and the small shadows in the interdental spaces and gingival third, consistent with the photograph's own light source and direction — do not flatten or remove them.",
  "Keep the smile naturally asymmetric: real smiles are never a mirror image of themselves, so leave the small left-right differences already visible in the patient's teeth rather than making both sides of the arch identical.",
  "Whitening or brightening the teeth must not shift the colour temperature of the surrounding lips, skin or gingiva; keep the rest of the photograph's white balance exactly as it was.",
].join(" ");

export function buildSmileInstruction(
  s: SmileSettings,
  hasReference = false,
  capture?: Framing,
  styleReferenceCount = 0,
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

  const styles = Math.max(0, Math.min(3, Math.trunc(styleReferenceCount)));

  // Spell out which supplied image is which, so the model never mistakes a
  // style reference for the patient it is meant to be editing.
  const order =
    hasReference || styles > 0
      ? ` Image order: the first image is the patient to edit.${
          hasReference
            ? " The next image is a smile the patient likes, supplied as a visual guide only."
            : ""
        }${
          styles > 0
            ? ` The ${hasReference ? "following" : "next"} ${styles === 1 ? "image is a finished case" : `${styles} images are finished cases`} completed by this clinician.`
            : ""
        } Edit only the first image.`
      : "";

  const reference = hasReference
    ? " Use the patient's reference smile only as a visual guide for the desired tooth shape, proportion and shade — do not copy the reference person's identity, lips, skin or face."
    : "";

  const houseStyle =
    styles > 0
      ? ` The clinician's own finished ${styles === 1 ? "case is" : "cases are"} supplied so the preview matches how this clinician actually works. Take from ${styles === 1 ? "it" : "them"} only the qualities that are consistent across ${styles === 1 ? "the case" : "every case"}: tooth contour and emergence profile, the shape of the incisal edges and line angles, surface texture and level of characterisation, incisal translucency and halo, how the shade is layered from cervical to incisal, and how the margins meet the gingiva. Do not copy any of these patients' tooth positions, arch form, midline, lip shape, gingival display, skin or identity, and do not average their arrangements together — the arrangement must come from the first image. Where ${styles === 1 ? "the case differs" : "the cases differ"} from one another, follow the first image and the settings above instead.`
      : "";

  const region = capture
    ? ` The photograph was captured with the smile aligned to an on-screen guide, so the teeth sit roughly between ${percent(capture.x)}% and ${percent(capture.x + capture.width)}% across the frame and ${percent(capture.y)}% to ${percent(capture.y + capture.height)}% down it. Confine every change to the teeth inside that region and leave every pixel outside it untouched. Use this only to locate the teeth that are already in the photograph — it is not a target size. Keep the teeth at the scale they were actually photographed at; never stretch, enlarge or shrink them to better fill the region.`
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
  } ${smileLines} ${EXISTING_DENTITION} ${NATURAL_SCALE_GUIDANCE} ${REALISM_GUIDANCE}`;

  return `Create a photorealistic cosmetic dentistry communication preview from the provided photograph. Modify only ${s.teeth} upper anterior teeth, symmetrically around the midline (FDI tooth numbers: ${s.selectedTeeth.join(", ")}). Treatment material: ${s.treatment}. ${shade} Tooth morphology: ${s.shape}. ${texture} Transformation intensity: ${s.intensity}/100. This governs how far the result may move from the original tooth form: at low values refine the existing teeth only — tidy the edges and adjust shade while leaving size, width and length close to the original; at high values a more designed result is acceptable, but every proportion rule still applies. ${DESIGN_PRINCIPLES} ${harmony} ${framing} Keep all untreated teeth exactly. Do not edit the gingiva; if the requested result would require gingival editing, reduce the tooth changes instead. Preserve realistic enamel translucency, interdental contacts and individual character. Avoid CGI, flat opaque white teeth, a uniform denture-like row, chiclet-shaped teeth, and any result whose teeth look larger, wider or longer than the patient\u2019s own.${region}${order}${reference}${houseStyle}${notes} Return only the edited photograph at exactly the same pixel dimensions, framing, scale, rotation and crop as the input, aligned so the original and the edit can be compared with a before-and-after slider. Do not zoom, pan, straighten, re-crop, mirror, or change the size or position of the face, lips or teeth within the frame.`;
}
