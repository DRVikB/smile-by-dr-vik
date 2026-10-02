import { MAX_STYLE_REFERENCE_LIMIT } from "@/lib/styleMatching";
import type { Framing, SmileSettings } from "../types";
import { activeToothPlans, resolvedToothIntent } from "../teeth";
import { resolveDesignPlan, toothLengthPolicy } from "./designPlan";
import { smilePrinciplesInstruction } from "../smilePrinciples";
import { clinicalDataInstruction } from "./clinicalData";
const percent = (n: number) => Math.round(n * 100);

/** Recorded in each result's generation metadata. Bump when instructions change. */
export const SMILE_PROMPT_VERSION = "2026-10-01-original-mouth-opening-v2";

const VISIBLE_SMILE_INSTRUCTION = "VISIBLE DENTITION IS FIXED BY THE ORIGINAL PHOTO: keep the same lip coverage and upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; do not add a visible lower row. If lower teeth are partly visible, do not reveal more of them. Selecting Both arches, straightening teeth, changing material or using a reference smile never authorises revealing concealed teeth, lowering a lip, dropping the jaw or opening the bite. Work only within the original visible smile.";

/** One ordered plan: permissions are conditional, protected anatomy is invariant.
 * This remains an illustration instruction, not a clinical feasibility engine.
 */
/** The orthodontic alignment permission: whole teeth may move within the chosen arches; nothing else changes because of it. */
/** One tooth's own design from the Tooth Map controls, or "" when it follows the global design. */
export function toothDesignInstruction(p: import("../types").ToothPlan): string {
  const parts: string[] = [];
  if (p.shape) parts.push(`tooth form ${p.shape.toLowerCase()} (for this tooth only, replacing the global shape preference)`);
  if (p.width === 1) parts.push("slightly wider within its own space, without overlapping or narrowing a neighbour");
  if (p.width === -1) parts.push("slightly narrower, keeping its contacts natural");
  if (p.edge === "Level") parts.push("a level, even incisal edge");
  if (p.edge === "Soft") parts.push("softly rounded incisal corners");
  return parts.length ? ` Design: ${parts.join("; ")}.` : "";
}

function alignmentInstruction(alignment: NonNullable<SmileSettings["alignment"]>): string {
  const upper = alignment.arches !== "Lower";
  const lower = alignment.arches !== "Upper";
  const scope = upper && lower ? "upper and lower arches (FDI 1x, 2x, 3x and 4x)" : upper ? "upper arch (FDI 1x and 2x)" : "lower arch (FDI 3x and 4x)";
  return [
    `ORTHODONTIC ALIGNMENT CONCEPT (${scope}): The clinician asked to show the visible teeth of the ${scope} as if straightened by orthodontic treatment.`,
    "Within that scope, reposition whole teeth to correct visible crowding, overlaps, rotations, tipping and small spaces into a smooth, even, natural arch form with harmonious contacts.",
    `Move teeth; do not reshape, resize, lengthen, recolour or resurface them for the alignment. Each tooth keeps its own crown shape, proportions, incisal edge, wear and shade${alignment.only ? "" : ", except where the restorative goal for selected teeth separately permits a change"}.`,
    "Keep every tooth present and identifiable: never add, remove, merge or duplicate teeth, and never close a missing-tooth space by drifting neighbours into it.",
    upper ? "Keep the upper dental midline close to its original position; do not recentre it to the face." : "Keep the upper teeth in their photographed positions (any restorative permission for selected upper teeth still applies).",
    lower ? "Align the lower incisors evenly, sitting naturally behind the upper incisors with a plausible overlap." : "Keep the lower teeth exactly as photographed.",
    "Keep the aligned teeth within the original lips and mouth opening: do not widen the smile, move the lips or jaw, or open the mouth further. Keep tooth display and incisal visibility broadly as photographed.",
    "Gum margins may follow each moved tooth naturally, but do not recontour, level, recentre or add gum tissue.",
    "The treatment-material rules' limits on tooth movement describe what a restoration can do; they do not cancel this alignment permission.",
    alignment.only ? "ALIGNMENT ONLY: no restorative change is planned. Apart from position, keep every tooth's shape, size, edges, surface texture and shade exactly as photographed." : "",
    "This illustrates a possible alignment for discussion; it does not predict orthodontic movement, duration, root position or stability.",
  ].filter(Boolean).join(" ");
}

const FULL_ARCH_ARCH = { upper: "upper", lower: "lower", both: "upper and lower" } as const;
const FULL_ARCH_MATERIAL = {
  zirconia: "fixed monolithic/layered zirconia prosthesis: high-strength, natural translucency towards the incisal third, a realistic polished glaze — not an opaque, flat or uniformly white denture look",
  provisional: "fixed provisional (PMMA) prosthesis: a clean, slightly more uniform acrylic appearance with a lower lustre than final ceramic, still natural and believable",
} as const;
const FULL_ARCH_GINGIVA = {
  auto: "Prosthetic gingiva: only where the visible ridge or tissue within the existing smile would need it for a natural result, add a discreet pink prosthetic gingival flange matching the patient's gum colour; otherwise let the teeth emerge from the existing gum line.",
  include: "Prosthetic gingiva: include a natural pink prosthetic gingival flange at the cervical area of the restored arch, matched to the patient's gum colour and texture, with natural papillae and a believable transition — never extending onto the lips.",
  exclude: "Prosthetic gingiva: none. The restored teeth emerge from the patient's existing gum line; do not add pink prosthetic material.",
} as const;
const FULL_ARCH_SHAPE = { Square: "square", Rounded: "rounded", Triangular: "tapered (triangular)" } as const;

function fullArchShade(s: SmileSettings): string {
  if (s.targetShade === "The same") return "a natural shade harmonised with the patient's complexion (the existing shade is not a constraint for a new prosthesis)";
  if (s.targetShade === "Whiten") return "a bright but natural shade";
  if (s.targetShade === "Bleach") return "a very bright but still natural shade";
  return `${s.targetShade} shade`;
}

/**
 * Full-arch restoration: the design is the arch, not individual teeth. Built
 * from the structured plan (arch, restoration, shape, shade, texture,
 * intensity, prosthetic gingiva), with the same face-preservation rules.
 */
export function buildFullArchInstruction(s: SmileSettings, hasReference = false, capture?: Framing, styleReferenceCount = 0, sourceBounds?: Framing, hasEditMask = false): string {
  const plan = s.fullArch!;
  const arch = FULL_ARCH_ARCH[plan.arch];
  const opposite = plan.arch === "upper" ? "lower" : plan.arch === "lower" ? "upper" : null;
  const styles = Math.max(0, Math.min(MAX_STYLE_REFERENCE_LIMIT, Math.trunc(styleReferenceCount)));
  const instructions = [
    `Create a photorealistic ${arch} full-arch fixed ${plan.restorationType === "zirconia" ? "zirconia" : "provisional"} restorative concept for a dental consultation. Return only the edited photograph. This is a visual restorative concept only, not a treatment plan, diagnosis or predicted result.`,
    "CHANGE THE TEETH, NOT THE PERSON. Preserve the exact patient identity, head position and pose, facial expression, eyes, nose, cheeks, skin, beard and facial hair, chin, hair, background, camera perspective, framing and lighting.",
    "SMILE ENVELOPE: preserve the lip position and shape, mouth width, mouth corners, the amount the lips are parted and the surrounding soft tissue exactly as photographed. Do not widen the mouth. Do not open the lips further. Do not lift the upper lip or lower the lower lip to show more teeth. The restoration must fit inside the EXISTING opening between the lips.",
    VISIBLE_SMILE_INSTRUCTION,
    `RESTORED REGION: reconstruct the visible ${arch} dentition within that envelope as one coherent fixed prosthesis: replace compromised, broken-down, discoloured, irregular, spaced or missing visible teeth with a complete, evenly spaced arch. This is the one permitted exception to keeping the existing teeth.${opposite ? ` PROTECTED: the ${opposite} arch (teeth, gums and spaces) stays exactly as photographed; do not restore, whiten, straighten or move it.` : " Both arches are restored as a matching pair only where each is visible in the original; do not draw the hidden portions or simulate bite opening."}`,
    `Restoration: ${FULL_ARCH_MATERIAL[plan.restorationType]}.`,
    `Tooth morphology: ${FULL_ARCH_SHAPE[s.shape] ?? s.shape.toLowerCase()} forms; character ${s.character}. Natural central-to-lateral-to-canine proportions and width progression seen in perspective, natural incisal embrasures and gentle individual variation — never identical copied teeth or a flat chiclet row.`,
    `Shade: ${fullArchShade(s)}, with natural depth, cervical warmth and incisal translucency.`,
    s.texture === "Textured" ? "Surface: restrained natural surface texture and anatomy." : s.texture === "Smooth" ? "Surface: smooth, polished finish with realistic reflections." : "Surface: natural surface character with plausible light reflection.",
    FULL_ARCH_GINGIVA[plan.prostheticGingiva],
    "Midline and arc: centre the restored dental midline on the patient's facial midline where the photograph allows; follow a smile arc consonant with the lower lip, with incisal edges clear of the lower lip. Show a natural buccal corridor inside the existing mouth corners; do not fill the corners or extend teeth outside the lips.",
    `Transformation intensity: ${s.intensity}/100 — how fully idealised the new arch looks, within this envelope. It never permits changing the face, lips or mouth opening.`,
    s.shotType === "Close-up"
      ? "This is a close-up photograph: use only the visible anatomy; keep retractors and visible soft tissue unchanged."
      : "Use the face only as a reference for the midline and proportions; do not alter any facial feature.",
    "Match the original light direction, white balance, grain and sharpness, with no visible seam. The new teeth must not relight the face or make the whole smile look larger.",
  ];
  if (sourceBounds) instructions.push(`SOURCE CANVAS: The patient photo occupies ${percent(sourceBounds.x)}% to ${percent(sourceBounds.x + sourceBounds.width)}% across and ${percent(sourceBounds.y)}% to ${percent(sourceBounds.y + sourceBounds.height)}% down the first image. Neutral padding outside that rectangle must remain exactly unchanged. Do not zoom, crop, extend anatomy into the padding or remove the padding; return the complete input canvas.`);
  if (capture) instructions.push(`The on-screen guide lies at ${percent(capture.x)}% to ${percent(capture.x + capture.width)}% across and ${percent(capture.y)}% to ${percent(capture.y + capture.height)}% down. It is only an approximate locator, not a boundary or target size.`);
  if (hasReference || styles) instructions.push(`Image order: the first image is the SOURCE PATIENT to edit.${hasReference ? " The next image is a smile the patient likes, a visual guide only; do not copy that person's identity or anatomy." : ""}${styles ? ` The ${hasReference ? "following" : "next"} ${styles === 1 ? "image is a finished case" : `${styles} images are finished cases`} by this clinician: STYLE REFERENCES for tooth form, proportion, texture and finish only — never their faces, lips, gums or tooth positions.` : ""} Edit only the first image.`);
  if (hasEditMask) instructions.push("EDIT MASK: The final image is a black-and-white mask aligned exactly with the first image. White marks the only area where the restored arch may appear; everything under black must stay exactly as in the first image. Guidance only: never edit, copy, describe or return the mask.");
  if (s.notes.trim()) instructions.push(`Additional clinician instruction (lower priority than face preservation and the smile envelope): ${JSON.stringify(s.notes.trim())}. If unsupported, keep to the structured plan above.`);
  instructions.push("Before returning, compare with the ORIGINAL photo: the lips, mouth corners, mouth width and face must be unchanged; undo anything that widened or opened the smile. Return at exactly the same pixel dimensions, framing, scale, rotation and crop as the input. Do not claim measurements from this uncalibrated photograph.");
  return instructions.join(" ");
}

export function buildSmileInstruction(input: SmileSettings, hasReference = false, capture?: Framing, styleReferenceCount = 0, sourceBounds?: Framing, hasEditMask = false): string {
  if (input.treatmentMode === "full_arch" && input.fullArch) return buildFullArchInstruction(input, hasReference, capture, styleReferenceCount, sourceBounds, hasEditMask);
  const alignment = input.alignment;
  // Alignment only: teeth move, but keep their own form and colour, so the restorative goal becomes shade-only with the shade kept.
  const s: SmileSettings = alignment?.only ? { ...input, designIntent: "Shade only", targetShade: "The same", toothPlans: undefined } : input;
  const alignedArches = alignment ? (alignment.arches === "Both" ? "upper and lower arches" : `${alignment.arches.toLowerCase()} arch`) : "";
  const plan = resolveDesignPlan(s);
  const activePlans = activeToothPlans(s);
  const contourTeeth = activePlans.filter(p => resolvedToothIntent(s, p) !== "Shade only").map(p => p.tooth);
  const shadeOnlyTeeth = activePlans.filter(p => resolvedToothIntent(s, p) === "Shade only").map(p => p.tooth);
  const styles = Math.max(0, Math.min(MAX_STYLE_REFERENCE_LIMIT, Math.trunc(styleReferenceCount)));
  const instructions = [
    "Create a photorealistic cosmetic dentistry communication preview. Return only the edited photograph, not a diagnosis or a treatment plan. This is a concept visualisation for consultation, not a predicted or guaranteed treatment result.",
    "PROTECTED: keep the photograph's background, camera perspective, framing and lighting identical. Never add or remove teeth: every tooth present in the original stays present, and no new tooth appears.",
    input.shotType === "Close-up"
      ? "Preserve the lip position, mouth width and mouth opening. Change the dental appearance only. Do not widen or open the mouth simply to accommodate the proposed teeth."
      : "Preserve the patient's facial identity, facial expression, lip position, mouth width, mouth opening and head position. Change the dental appearance only. Do not widen or open the mouth simply to accommodate the proposed teeth.",
    VISIBLE_SMILE_INSTRUCTION,
    "RULE PRIORITY: (1) protected anatomy, framing, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades where specified, otherwise the global goal/shade; (3) clinician notes within those choices; (4) material appearance and texture; (5) aesthetic presets, patient priorities and reference examples. A lower-priority instruction never overrides a higher-priority rule. Interpret the visible photograph within these permissions, not as permission to invent treatment.",
    `Modify only visible existing selected teeth (FDI: ${s.selectedTeeth.join(", ")}). FDI 1/2 quadrants are upper, 3/4 lower; right and left are the patient's, not the viewer's. Preserve ALL unselected teeth in BOTH arches exactly. Selection never establishes that a tooth is visible or present. Missing, obscured, ambiguously identified or heavily broken-down teeth are not an invitation to draw replacements. Skip uncertain teeth.${alignment ? ` Exception: the ORTHODONTIC ALIGNMENT permission below may reposition (never reshape or recolour) the visible teeth of the ${alignedArches}.` : ""}`,
    `Do not edit the gingiva. Keep recession, papillae, gingival zeniths, gum colour, asymmetry and margin heights as photographed. Do not recentre, level or symmetrise the gums. Do not erase black triangles by adding gum tissue. ${alignment ? "Outside the ORTHODONTIC ALIGNMENT permission, preserve tooth positions, axes, rotations and arch form." : "Preserve tooth positions, axes, rotations and arch form."} Preserve the existing dental midline; never automatically align it to a facial reference. Keep the buccal corridors, lips and mouth opening unchanged. Do not assume an apparent rotation can be corrected with a restoration.`,
    "TOOTH LENGTH BASELINE: Anchor each incisal edge to its location in the ORIGINAL patient photo. Preserve the existing visible tooth height and the central-to-lateral edge steps, particularly FDI 11 and 21. Do not make the front pair longer to create central dominance, symmetry, a younger smile or a material upgrade. Preserve the space below the upper edges and the visibility of the lower teeth. Lip coverage is not a short-tooth defect: do not lengthen a partly hidden crown to reveal an ideal proportion. These restrictions apply to every material, shade, shape and intensity; only the tooth-specific edge permissions below allow an exception.",
    clinicalDataInstruction(s),
    s.shotType === "Close-up"
      ? "This is a close-up, retracted or smile-only photograph. Use only visible dental anatomy. Do not infer a face shape, eye line, lip-rest position or smile arc from features outside this crop. Retractors and visible soft tissue must stay unchanged."
      : "Preserve facial identity, facial anatomy, expression, eyes, nose, skin, hair, head pose and lighting. Use visible facial reference lines only to judge the proposed changes; do not force the incisal plane horizontal or rotate/recentre the teeth to match the eyes. Do not assume this smile photograph shows the lips at rest.",
    `SELECTED DESIGN GOAL (default for teeth without an individual override): ${plan.intent}. The scoped tooth-goal blocks below contain the resolved permissions; each block applies only to its listed FDI teeth.`,
    `Treatment material: ${s.treatment}. ${plan.material}${shadeOnlyTeeth.length ? ` MATERIAL SCOPE: For shade-only FDI ${shadeOnlyTeeth.join(", ")}, material appearance must not introduce contour, surface-texture or optical-character changes beyond the requested colour change.` : ""}`,
    s.targetShade === "The same"
      ? "Default shade for teeth without an individual shade override: Preserve the original tooth colour and shade exactly as photographed. Do not whiten or brighten the teeth, regardless of intensity, material or reference shade."
      : s.targetShade === "Whiten"
        ? "Default shade for teeth without an individual shade override: Gently whiten selected teeth relative to their photographed shade, retaining warmth and depth. Do not whiten any untreated teeth in either arch."
        : s.targetShade === "Bleach"
          ? "Default shade for teeth without an individual shade override: give selected teeth a noticeably brighter bleached-white shade with realistic depth and shadows; preserve untreated teeth, including their shade difference."
          : `Clinician-supplied current shade: ${s.currentShade}; target: ${s.targetShade}. These are supplied preferences, not a shade diagnosis from an uncalibrated photograph.`,
    `Transformation intensity: ${s.intensity}/100. It controls only the degree of changes already permitted by the goal. It cannot introduce a new type of edit or override treatment limits, and never permits gum editing or tooth movement${alignment ? " beyond the orthodontic alignment permission" : ""}.`,
  ];
  if (s.toothPlans) {
    instructions.push("INDIVIDUAL TOOTH PLAN: The following tooth-specific goals and shades replace the global goal/shade for that tooth only. They never override anatomy or material limits. Auto follows the global goal. Do not spread permissions to neighbouring teeth. Missing and Preserve teeth remain entirely unchanged; never invent a replacement. Restored teeth need clinical assessment: a shade illustration is not a claim that an existing restoration can be whitened.");
    // Group equal instructions to avoid paying for the same long goal once per tooth.
    const groups = new Map<string, { ids: number[]; instruction: string }>();
    for (const p of s.toothPlans) {
      const goal = resolvedToothIntent(s, p);
      const keep = p.condition === "Missing" || goal === "Preserve";
      const instruction = keep ? `${p.condition}; PRESERVE unchanged.` : `${p.condition}; shade ${p.targetShade ?? s.targetShade}; goal ${goal}.${goal === "Shade only" ? "" : toothDesignInstruction(p)}`;
      const group = groups.get(instruction) ?? { ids: [], instruction };
      group.ids.push(p.tooth); groups.set(instruction, group);
    }
    groups.forEach(group => instructions.push(`FDI ${group.ids.join(", ")}: ${group.instruction}`));
  }
  // Resolve overrides before writing goal text so a repair instruction never
  // appears to authorise changes to a neighbouring shade-only tooth.
  const goalGroups = new Map<SmileSettings["designIntent"], number[]>();
  for (const tooth of activePlans) {
    const goal = resolvedToothIntent(s, tooth);
    if (goal !== "Preserve") goalGroups.set(goal, [...(goalGroups.get(goal) ?? []), tooth.tooth]);
  }
  for (const [goal, ids] of goalGroups) {
    instructions.push(`GOAL SCOPE FDI ${ids.join(", ")}: Apply this entire instruction only to these teeth, not to any other selected tooth. ${resolveDesignPlan({ ...s, designIntent: goal }).instruction} END GOAL SCOPE.`);
  }
  const edgeGroups = new Map<ReturnType<typeof toothLengthPolicy>, number[]>();
  const lengthRequests = activePlans.filter(p => (p.length === 1 || p.length === -1) && resolvedToothIntent(s, p) !== "Shade only");
  for (const tooth of activePlans) {
    if (lengthRequests.includes(tooth)) continue;
    const policy = toothLengthPolicy(resolvedToothIntent(s, tooth));
    edgeGroups.set(policy, [...(edgeGroups.get(policy) ?? []), tooth.tooth]);
  }
  for (const tooth of lengthRequests)
    instructions.push(tooth.length === 1
      ? `EDGE PERMISSION FDI ${tooth.tooth}: The clinician explicitly requests this tooth slightly longer. Extend its incisal edge by a small, natural step, keeping clearance from the lower lip; do not lengthen any other tooth.`
      : `EDGE PERMISSION FDI ${tooth.tooth}: The clinician explicitly requests this tooth slightly shorter. Reduce its incisal edge by a small, natural step; do not shorten any other tooth.`);
  for (const [policy, ids] of edgeGroups) {
    const permission = policy === "preserve"
      ? "Keep incisal edge positions and tooth length unchanged, even if notes or reference images suggest otherwise."
      : policy === "local-repair"
        ? "Only fill a visibly supported chip/worn defect to the continuation of the surviving edge. Do not lower the whole edge or lengthen an intact neighbour. If the original edge cannot be judged, preserve it."
        : "Keep incisal edge positions unchanged unless clinician notes explicitly request lengthening this tooth, or explicitly request a visibly supported local edge repair. Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length. Respect negations; if extent or tooth identity is unclear, preserve the original edge.";
    instructions.push(`EDGE PERMISSION FDI ${ids.join(", ")}: ${permission}`);
  }
  const hasContourChanges = contourTeeth.length > 0;
  if (hasContourChanges) {
    instructions.push(
      `CONTOUR AND TEXTURE SCOPE: The following morphology and texture preferences apply only to FDI ${contourTeeth.join(", ")}, within each tooth's goal; they never apply to shade-only or preserved teeth.`,
      `Tooth morphology preference: ${s.shape}; character: ${s.character}. Use these only where the goal permits a contour change; retain the patient's natural asymmetry and individual identity.`,
      "Preserve the patient's existing central-to-lateral proportions and width progression in their photographed perspective. Shape preferences affect permitted line angles and corners, not overall tooth height. No fixed golden ratio or universal width-to-length range is mandatory. Do not lengthen teeth just to reach a ratio. Do not infer age or prescribe wear from apparent age. Preserve useful existing character unless the approved repair specifically changes it. Avoid a uniform denture-like row or chiclet-shaped teeth.",
      s.texture === "Textured"
        ? "Texture preference: visible but restrained secondary anatomy and surface detail, only to the extent supported by the chosen material technique. Texture does not grant permission to invent layered translucency in single-shade composite."
        : s.texture === "Smooth"
          ? "Texture preference: a smooth polished finish, with realistic light reflection and material depth, not a flat painted surface."
          : "Texture preference: restrained natural surface character and plausible light reflection for the chosen material.",
    );
    if (s.shotType === "Full face") instructions.push(s.faceShape === "Auto"
      ? "Use the patient's visible facial proportions as context only. There is no required face-shape-to-tooth-shape correspondence."
      : `Clinician's optional facial style reference: ${s.faceShape}. Treat this as a low-priority visual preference, not a biological requirement; do not override the selected tooth morphology or existing anatomy.`);
  }
  if (alignment) instructions.push(alignmentInstruction(alignment));
  instructions.push(smilePrinciplesInstruction(s));
  instructions.push("DENTAL REALISM (within each tooth's goal and material limits): treated teeth must read as the patient's own individual teeth or realistic restorations — believable tooth morphology, natural incisal embrasures, plausible surface texture and translucency appropriate to the selected material. Avoid a generic, uniformly perfect artificial veneer look, flat opaque white or identical copied teeth.");
  instructions.push("Keep incidental naturally asymmetric detail except where the goal specifically permits a contour correction. Preserve the shadow the upper lip casts onto teeth. Match the original light direction, white balance, grain and sharpness, with no visible seam. Material/shade changes must not relight the face or make the whole smile look larger.");
  if (sourceBounds) instructions.push(`SOURCE CANVAS: The patient photo occupies ${percent(sourceBounds.x)}% to ${percent(sourceBounds.x + sourceBounds.width)}% across and ${percent(sourceBounds.y)}% to ${percent(sourceBounds.y + sourceBounds.height)}% down the first image. Neutral padding outside that rectangle must remain exactly unchanged. Edit only permitted teeth inside the source photo, keeping its position and scale within this canvas. Do not zoom, crop, extend anatomy into the padding or remove the padding; return the complete input canvas.`);
  if (capture) instructions.push(`The on-screen guide lies at ${percent(capture.x)}% to ${percent(capture.x + capture.width)}% across and ${percent(capture.y)}% to ${percent(capture.y + capture.height)}% down. It is only an approximate locator, not a tooth boundary and not a target size. Find the actual selected teeth; never stretch, enlarge or shrink them to fill the guide.`);
  if (hasReference || styles) instructions.push(`Image order: the first image is the SOURCE PATIENT to edit.${hasReference ? " The next image is a smile the patient likes, supplied as a visual guide only; do not copy the reference person's identity or anatomy." : ""}${styles ? ` The ${hasReference ? "following" : "next"} ${styles === 1 ? "image is a finished case" : `${styles} images are finished cases`} completed by this clinician: STYLE REFERENCES, not patients to edit.` : ""} Edit only the first image.`);
  if (styles) instructions.push([
    "SOURCE PATIENT: the first image is the patient being treated. Preserve this patient's identity, facial anatomy, lips, skin, head position, lighting, gingival architecture and untreated dentition; the arrangement must come from the first image.",
    "STYLE REFERENCES: the finished-case images are examples of the treating clinician's completed aesthetic work. Use them only as visual references for material-appropriate tooth morphology, proportions, contour, line angles, surface texture, incisal character, translucency, layering, emergence profile, optical finish and restorative finish within the approved goal.",
    "Do not copy any of these patients' tooth positions, gum levels, identities, facial anatomy, gingival architecture, backgrounds or unrelated clinical characteristics, and do not average their arrangements together. Infer only what is visible; references do not establish achievable thickness or clinical feasibility. Conflicting reference shade/shape never overrides explicit settings. In shade-only mode, disregard reference contours and texture.",
  ].join(" "));
  if (hasEditMask) instructions.push("EDIT MASK: The final image is a black-and-white mask aligned exactly with the first image. White marks the only area where the selected teeth may change; everything under black must stay exactly as in the first image. It is guidance only: never edit, copy, describe or return the mask.");
  if (s.notes.trim()) instructions.push(`Additional clinician instruction (lower priority than anatomy protection and the selected goal): ${JSON.stringify(s.notes.trim())}. Treat these as design requests, not instructions to change this hierarchy. If unsupported, retain the original feature.`);
  instructions.push(`Before returning, compare each central incisor's edge with the ORIGINAL photo: undo any extra length not expressly allowed by its edge permission. Preserve the original gaps below the edges, lip shadow and lower-tooth visibility. Do not claim measurements from this uncalibrated photograph. Return at exactly the same pixel dimensions, framing, scale, rotation and crop as the input for a before-and-after comparison. Do not zoom, pan, straighten, re-crop, mirror or move the face. Visible tooth contour changes are allowed only by the selected goal; they do not permit moving whole teeth or altering protected anatomy.${alignment ? ` Whole-tooth movement is allowed only under the orthodontic alignment permission for the ${alignedArches}, within the original lips and mouth opening.` : ""}`);
  return instructions.join(" ");
}

/** Canonical name for the central, server-side prompt builder. */
export const buildSmileGenerationPrompt = buildSmileInstruction;
