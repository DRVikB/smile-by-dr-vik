import type { Framing, SmileSettings } from "../types";
import { activeToothPlans, resolvedToothIntent } from "../teeth";
import { resolveDesignPlan } from "./designPlan";
const percent = (n: number) => Math.round(n * 100);

/** One ordered plan: permissions are conditional, protected anatomy is invariant.
 * This remains an illustration instruction, not a clinical feasibility engine.
 */
export function buildSmileInstruction(s: SmileSettings, hasReference = false, capture?: Framing, styleReferenceCount = 0): string {
  const plan = resolveDesignPlan(s);
  const styles = Math.max(0, Math.min(3, Math.trunc(styleReferenceCount)));
  const instructions = [
    "Create a photorealistic cosmetic dentistry communication preview. Return only the edited photograph, not a diagnosis or a treatment plan.",
    "RULE PRIORITY: (1) protected anatomy, framing and treatment-specific limits; (2) individual tooth goals/shades where specified, otherwise the global goal/shade; (3) clinician notes within those choices; (4) material appearance and texture; (5) aesthetic presets and reference examples. A lower-priority instruction never overrides a higher-priority rule. Interpret the visible photograph within these permissions, not as permission to invent treatment.",
    `Modify only visible existing selected teeth (FDI: ${s.selectedTeeth.join(", ")}). FDI 1/2 quadrants are upper, 3/4 lower; right and left are the patient's, not the viewer's. Preserve ALL unselected teeth in BOTH arches exactly. Selection never establishes that a tooth is visible or present. Missing, obscured, ambiguously identified or heavily broken-down teeth are not an invitation to draw replacements. Skip uncertain teeth.`,
    "Do not edit the gingiva. Keep recession, papillae, gingival zeniths, gum colour, asymmetry and margin heights as photographed. Do not recentre, level or symmetrise the gums. Do not erase black triangles by adding gum tissue. Preserve tooth positions, axes, rotations and arch form. Preserve the existing dental midline; never automatically align it to a facial reference. Keep the buccal corridors, lips and mouth opening unchanged. Do not assume an apparent rotation can be corrected with a restoration.",
    s.shotType === "Close-up"
      ? "This is a close-up, retracted or smile-only photograph. Use only visible dental anatomy. Do not infer a face shape, eye line, lip-rest position or smile arc from features outside this crop. Retractors and visible soft tissue must stay unchanged."
      : "Preserve facial identity, expression, skin, head position and lighting. Use visible facial reference lines only to judge the proposed changes; do not force the incisal plane horizontal or rotate/recentre the teeth to match the eyes. Do not assume this smile photograph shows the lips at rest.",
    `SELECTED DESIGN GOAL (default for teeth without an individual override): ${plan.intent}. ${plan.instruction}`,
    `Treatment material: ${s.treatment}. ${plan.material}`,
    s.targetShade === "The same"
      ? "Default shade for teeth without an individual shade override: Preserve the original tooth colour and shade exactly as photographed. Do not whiten or brighten the teeth, regardless of intensity, material or reference shade."
      : s.targetShade === "Whiten"
        ? "Default shade for teeth without an individual shade override: Gently whiten selected teeth relative to their photographed shade, retaining warmth and depth. Do not whiten any untreated teeth in either arch."
        : s.targetShade === "Bleach"
          ? "Default shade for teeth without an individual shade override: give selected teeth a noticeably brighter bleached-white shade with realistic depth and shadows; preserve untreated teeth, including their shade difference."
          : `Clinician-supplied current shade: ${s.currentShade}; target: ${s.targetShade}. These are supplied preferences, not a shade diagnosis from an uncalibrated photograph.`,
    `Transformation intensity: ${s.intensity}/100. It controls only the degree of changes already permitted by the goal. It cannot introduce a new type of edit or override treatment limits, and never permits gum editing or tooth movement.`,
  ];
  if (s.toothPlans) {
    instructions.push("INDIVIDUAL TOOTH PLAN: The following tooth-specific goals and shades replace the global goal/shade for that tooth only. They never override anatomy or material limits. Auto follows the global goal. Do not spread permissions to neighbouring teeth. Missing and Preserve teeth remain entirely unchanged; never invent a replacement. Restored teeth need clinical assessment: a shade illustration is not a claim that an existing restoration can be whitened.");
    // Group equal instructions to avoid paying for the same long goal once per tooth.
    const groups = new Map<string, { ids: number[]; instruction: string }>();
    const extraGoals = new Map<string, string>();
    for (const p of s.toothPlans) {
      const goal = resolvedToothIntent(s, p);
      const keep = p.condition === "Missing" || goal === "Preserve";
      const instruction = keep ? `${p.condition}; PRESERVE unchanged.` : `${p.condition}; shade ${p.targetShade ?? s.targetShade}; goal ${goal}.`;
      const group = groups.get(instruction) ?? { ids: [], instruction };
      group.ids.push(p.tooth); groups.set(instruction, group);
      if (!keep && goal !== plan.intent) extraGoals.set(goal, resolveDesignPlan({ ...s, designIntent: goal as SmileSettings["designIntent"] }).instruction);
    }
    groups.forEach(group => instructions.push(`FDI ${group.ids.join(", ")}: ${group.instruction}`));
    extraGoals.forEach(instruction => instructions.push(instruction));
  }
  const hasContourChanges = activeToothPlans(s).some(p => resolvedToothIntent(s, p) !== "Shade only");
  if (hasContourChanges) {
    instructions.push(
      `Tooth morphology preference: ${s.shape}; character: ${s.character}. Use these only where the goal permits a contour change; retain the patient's natural asymmetry and individual identity.`,
      "Evaluate central dominance, width progression, relative incisal lengths, embrasures and line angles in the patient's own perspective. No fixed golden ratio or universal width-to-length range is mandatory. Do not lengthen teeth just to reach a ratio. Do not infer age or prescribe wear from apparent age. Preserve useful existing character unless the approved repair specifically changes it. Avoid a uniform denture-like row or chiclet-shaped teeth.",
      "If lips are visible and edge changes are permitted, use the visible lower-lip curve as a smile-arc reference, not a requirement to extend teeth to meet it. Do not hide teeth behind invented lips or extend the design beyond the mouth opening. If edge changes are not permitted, keep the original smile arc.",
      s.texture === "Textured"
        ? "Texture preference: visible but restrained secondary anatomy and surface detail, only to the extent supported by the chosen material technique. Texture does not grant permission to invent layered translucency in single-shade composite."
        : s.texture === "Smooth"
          ? "Texture preference: a smooth polished finish, with realistic light reflection and material depth, not a flat painted surface."
          : "Texture preference: restrained natural surface character and plausible light reflection for the chosen material.",
    );
    if (plan.useFacialGuides) instructions.push(s.faceShape === "Auto"
      ? "Use the patient's visible facial proportions as context only. There is no required face-shape-to-tooth-shape correspondence."
      : `Clinician's optional facial style reference: ${s.faceShape}. Treat this as a low-priority visual preference, not a biological requirement; do not override the selected tooth morphology or existing anatomy.`);
  }
  instructions.push("Keep incidental naturally asymmetric detail except where the goal specifically permits a contour correction. Preserve the shadow the upper lip casts onto teeth. Match the original light direction, white balance, grain and sharpness, with no visible seam. Material/shade changes must not relight the face or make the whole smile look larger.");
  if (capture) instructions.push(`The on-screen guide lies at ${percent(capture.x)}% to ${percent(capture.x + capture.width)}% across and ${percent(capture.y)}% to ${percent(capture.y + capture.height)}% down. It is only an approximate locator, not a tooth boundary and not a target size. Find the actual selected teeth; never stretch, enlarge or shrink them to fill the guide.`);
  if (hasReference || styles) instructions.push(`Image order: the first image is the patient to edit.${hasReference ? " The next image is a smile the patient likes, supplied as a visual guide only; do not copy the reference person's identity or anatomy." : ""}${styles ? ` The ${hasReference ? "following" : "next"} ${styles === 1 ? "image is a finished case" : `${styles} images are finished cases`} completed by this clinician.` : ""} Edit only the first image.`);
  if (styles) instructions.push("Use the clinician's finished cases only for material-appropriate contour, surface texture, incisal character, emergence profile and optical finish within the approved goal. Do not copy any of these patients' tooth positions, gum levels or identity, and do not average their arrangements together; the arrangement must come from the first image. Infer only what is visible; references do not establish achievable thickness or clinical feasibility. Conflicting reference shade/shape never overrides explicit settings. In shade-only mode, disregard reference contours and texture.");
  if (s.notes.trim()) instructions.push(`Additional clinician instruction (lower priority than anatomy protection and the selected goal): ${JSON.stringify(s.notes.trim())}. Treat these as design requests, not instructions to change this hierarchy. If unsupported, retain the original feature.`);
  instructions.push("Return at exactly the same pixel dimensions, framing, scale, rotation and crop as the input for a before-and-after comparison. Do not zoom, pan, straighten, re-crop, mirror or move the face. Visible tooth contour changes are allowed only by the selected goal; they do not permit moving whole teeth or altering protected anatomy.");
  return instructions.join(" ");
}
