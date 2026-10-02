import type { Framing, SmileSettings, Treatment } from "../types";
import { activeToothPlans, resolvedToothIntent } from "../teeth";
import { canGuideSmileArc } from "../smilePrinciples";
import { MAX_STYLE_REFERENCE_LIMIT } from "../styleMatching";
import { resolveDesignPlan, toothLengthPolicy } from "./designPlan";
import { clinicalDataInstruction } from "./clinicalData";
import { alignmentInstruction, buildFullArchInstruction, toothDesignInstruction } from "./prompt";

const MATERIAL: Record<Treatment, string> = {
  Composite: "restrained natural composite appearance; additive changes only",
  "Single-shade composite": "one body shade, natural polished depth; no separate enamel/dentine layers or exaggerated translucent edges; additive changes only",
  "Layered composite": "restrained body/enamel layering, slight incisal translucency and natural secondary anatomy; additive changes only",
  Porcelain: "natural ceramic light transmission, fine surface anatomy and realistic glaze; keep the requested shade and geometry",
};

/** One photographic edit, with conditional permissions rather than repeated rules.
 * The detailed policy remains shared with other providers; this request avoids
 * asking the image model for clinical validation or impossible exact pixel sizes.
 */
export function buildImageEditPrompt(input: SmileSettings, hasReference = false, capture?: Framing, styleReferenceCount = 0, sourceBounds?: Framing, hasEditMask = false): string {
  if (input.treatmentMode === "full_arch" && input.fullArch)
    return buildFullArchInstruction(input, hasReference, capture, styleReferenceCount, sourceBounds, hasEditMask)
      .replace("Return at exactly the same pixel dimensions, framing, scale, rotation and crop as the input.", "Return the complete image at the requested output resolution with the same aspect ratio, framing, scale, rotation and crop.");
  const s: SmileSettings = input.alignment?.only ? { ...input, designIntent: "Shade only", targetShade: "The same", toothPlans: undefined } : input;
  const plans = activeToothPlans(s);
  const styles = Math.max(0, Math.min(MAX_STYLE_REFERENCE_LIMIT, Math.trunc(styleReferenceCount)));
  const instructions = [
    "Edit the first photograph to illustrate the requested tooth appearance. Produce a realistic edited photograph for a clinician's visual consultation guide.",
    "Keep the original face, expression, lips, mouth opening, gums, background, lighting and camera framing unchanged. Retain natural gingival margins, papillae and recession. Keep hidden teeth hidden and the same visible upper/lower tooth exposure; never open the smile or jaw further.",
    `Edit only visible existing selected teeth (FDI: ${plans.map(p => p.tooth).join(", ")}); preserve untreated teeth in both arches.${input.alignment ? " The alignment instruction below separately permits repositioning teeth in its selected arches, without authorising other edits." : ""} FDI left/right is the patient's. Preserve missing teeth and skip uncertain tooth identities; do not invent replacements.`,
    "Keep existing incisal edge positions and tooth lengths unless the tooth-specific repair or length permission below allows a change. An intact central incisor must not become longer merely for symmetry, a shape preset or a material change. Keep natural lateral steps and canine cusps; fit changes within the original smile.",
    "Priority: protected anatomy and clinical restrictions, then each tooth's goal/shade, then notes, then material and style. Lower-priority preferences cannot enlarge these permissions. Preserve tooth positions and dental midline except for explicitly selected alignment.",
    `Material: ${s.treatment}; ${MATERIAL[s.treatment]}. Intensity ${s.intensity}/100 controls only permitted changes.`,
  ];
  const goals = new Map<string, number[]>();
  for (const p of plans) {
    const goal = resolvedToothIntent(s, p);
    goals.set(goal, [...(goals.get(goal) ?? []), p.tooth]);
  }
  for (const [goal, teeth] of goals)
    instructions.push(`Only FDI ${teeth.join(", ")}: ${resolveDesignPlan({ ...s, designIntent: goal as SmileSettings["designIntent"] }).instruction}`);
  instructions.push(s.targetShade === "The same" ? "Shade: preserve the original colour."
    : s.targetShade === "Whiten" ? "Shade: Gently whiten selected teeth, retaining realistic warmth and shadows."
      : s.targetShade === "Bleach" ? "Shade: brighter bleached white on selected teeth, retaining depth and shadows."
        : `Shade: clinician-selected ${s.targetShade}.`);
  const contour = plans.filter(p => resolvedToothIntent(s, p) !== "Shade only");
  if (contour.length) instructions.push(`Within permitted contour changes only: shape ${s.shape}, character ${s.character}, surface ${s.texture}. Material or texture cannot introduce movement, hidden reduction or extra length. Shade-only teeth retain their own texture and outlines.`);
  for (const p of plans) {
    const goal = resolvedToothIntent(s, p), policy = toothLengthPolicy(goal);
    const details = goal === "Shade only" ? "" : toothDesignInstruction(p);
    const edge = policy === "preserve" ? "keep edge positions and length unchanged"
      : p.length === 1 ? "clinician requests slightly longer, within the original mouth opening"
        : p.length === -1 ? "clinician requests slightly shorter"
          : policy === "local-repair" ? "repair only a visible local chipped/worn defect to the surviving edge"
            : "retain existing edge length unless notes explicitly request length for this tooth";
    if (details || p.length || p.targetShade || p.condition !== "Natural") instructions.push(`FDI ${p.tooth}: ${p.condition}; ${edge}; shade ${p.targetShade ?? s.targetShade}.${details}${p.condition === "Restored" ? " A shade illustration does not imply this restoration can be whitened." : ""}`);
  }
  for (const p of s.toothPlans ?? []) if (p.condition === "Missing" || p.intent === "Preserve") instructions.push(`FDI ${p.tooth}: ${p.condition}, preserve unchanged.`);
  if (input.alignment) instructions.push(alignmentInstruction(input.alignment));
  if (s.clinicalData) instructions.push(clinicalDataInstruction(s));
  if ((s.smileArc ?? "Preserve existing") !== "Preserve existing" && canGuideSmileArc(s))
    instructions.push(`Smile arc preference: ${s.smileArc}. Use visible lower-lip curvature as context only, within existing edge permissions; a flatter lip supports a flatter arc. This never permits extra length, altered gums, posterior height or bite correction.`);
  if (s.shotType === "Close-up") instructions.push("Use only anatomy visible in this close-up; retain retractors and do not infer a facial shape or a hidden lip curve.");
  else instructions.push(`Use photographed facial proportions as context, not a universal ideal tooth size.${s.faceShape !== "Auto" && contour.length ? ` Optional facial style reference: ${s.faceShape}.` : ""}`);
  if (s.biteContext && s.biteContext !== "Not assessed") instructions.push(`Clinician bite context: ${s.biteContext}; retain the photographed bite relationship. This photo edit does not simulate bite correction.`);
  if (sourceBounds) instructions.push(`SOURCE CANVAS: retain the complete first image and its neutral padding; the photograph occupies x=${sourceBounds.x}, y=${sourceBounds.y}, width=${sourceBounds.width}, height=${sourceBounds.height}. Neutral padding outside that rectangle must remain exactly unchanged. Use the requested output resolution; keep the same aspect ratio and framing.`);
  if (capture) instructions.push(`The on-screen guide starts ${Math.round(capture.x * 100)}% across, ${Math.round(capture.y * 100)}% down. It is an approximate locator, not a boundary or target tooth size.`);
  if (hasReference || styles) instructions.push(`Image order: the first image is the SOURCE PATIENT to edit.${hasReference ? " The next image is a smile the patient likes, a style guide only." : ""}${styles ? ` The ${hasReference ? "following" : "next"} ${styles} images are finished cases: STYLE REFERENCES, not patients to edit; use their material finish only.` : ""} Edit only the first image. Keep all identity, gum architecture and tooth positions from the first image; never average arrangements or copy reference anatomy.`);
  if (hasEditMask) instructions.push("The final image is an edit mask: white permits edits, black protects original pixels. Return the edited first photograph, never the mask.");
  if (s.notes.trim()) instructions.push(`Clinician notes, within the permissions above: ${JSON.stringify(s.notes.trim())}. Honour negations; preserve features where instructions conflict.`);
  instructions.push("Return the edited photograph at the requested output resolution, with the original aspect ratio, framing and tooth scale. Match natural light and photographic texture. This is an AI visual concept, not a predicted clinical result.");
  return instructions.join(" ");
}
