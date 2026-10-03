import { MAX_STYLE_REFERENCE_LIMIT } from "../styleMatching";
import { activeToothPlans, resolvedToothIntent } from "../teeth";
import { canGuideSmileArc } from "../smilePrinciples";
import { DEFAULT_FULL_ARCH, type Framing, type SmileSettings, type TargetShade, type ToothPlan } from "../types";
import { resolveDesignPlan, toothLengthPolicy } from "./designPlan";

export { SMILE_PROMPT_VERSION } from "./version";
export interface RenderContext { hasReference?: boolean; framing?: Framing; styleReferenceCount?: number; sourceBounds?: Framing; hasEditMask?: boolean }
export type ContractMode = "whitening" | "restorative" | "alignment" | "full_arch";

/** Intentionally not rendered. Kept in case/report state, not reinterpreted as geometry. */
export const NON_RENDER_FIELDS = {
  biteContext: "Clinician-only: a photograph does not validate occlusion or bite correction.",
  "clinicalData.overbiteMm": "Clinician-only: no millimetre-to-pixel or biomechanical inference.",
  "clinicalData.overjetMm": "Clinician-only: no millimetre-to-pixel or biomechanical inference.",
  "clinicalData.patientPriorities": "Report-only: broad priorities do not grant rendering permissions; use explicit design controls/notes.",
  caseFeatures: "Reference-matching/report metadata, not diagnoses or permissions to edit anatomy.",
  teeth: "Preset count selects FDI state; actual selectedTeeth/toothPlans define the render region.",
  libraryStyle: "Server controls attachment of authorised matching references; the flag alone supplies no image style.",
} as const;

/** A copy of render-relevant state. Never rewrites legacy cases or stored choices. */
export function normalizeGenerationContract(s: SmileSettings, context: RenderContext = {}) {
  const fullArch = s.treatmentMode === "full_arch" ? { ...(s.fullArch ?? DEFAULT_FULL_ARCH), prostheticGingiva: s.fullArch?.prostheticGingiva === "include" ? "include" as const : "exclude" as const } : undefined;
  const mode: ContractMode = fullArch ? "full_arch" : s.alignment?.only ? "alignment" : s.treatment === "Whitening" ? "whitening" : "restorative";
  const teeth = fullArch || mode === "alignment" ? [] : activeToothPlans(s).map(p => ({ ...p, intent: resolvedToothIntent(s, p), targetShade: p.targetShade ?? s.targetShade }));
  const contour = mode === "full_arch" || (mode === "restorative" && teeth.some(p => p.intent !== "Shade only"));
  const arcActive = contour && s.shotType === "Full face" && (fullArch ? fullArch.arch !== "lower" : canGuideSmileArc(s));
  return {
    mode, fullArch, teeth, preservedTeeth: fullArch || mode === "alignment" ? [] : (s.toothPlans ?? []).filter(p => p.intent === "Preserve" || p.condition === "Missing").map(p => ({ ...p })),
    alignment: fullArch ? undefined : s.alignment ? { ...s.alignment, arches: "Both" as const } : undefined,
    treatment: mode === "restorative" ? s.treatment : undefined,
    targetShade: mode === "alignment" ? "The same" as const : s.targetShade,
    currentShade: s.currentShade && s.currentShadeSource ? { value: s.currentShade, source: s.currentShadeSource } : undefined,
    shape: contour ? s.shape : undefined, character: contour ? s.character : undefined, texture: contour ? s.texture : undefined,
    intensity: s.intensity, smileArc: arcActive ? s.smileArc ?? "Preserve existing" : "Preserve existing",
    faceShape: contour && s.shotType === "Full face" && s.faceShape !== "Auto" ? s.faceShape : undefined,
    shotType: s.shotType, constraints: s.clinicalData?.constraints?.trim() || undefined,
    limitedSpace: s.clinicalData?.restorativeSpace === "Limited / uncertain", notes: s.notes.trim(),
    context: { ...context, styleReferenceCount: Math.max(0, Math.min(MAX_STYLE_REFERENCE_LIMIT, Math.trunc(context.styleReferenceCount ?? 0))) },
  };
}
export type GenerationContract = ReturnType<typeof normalizeGenerationContract>;

function shadeInstruction(shade: TargetShade): string {
  if (shade === "The same") return "No intentional shade change from the source appearance. Do not whiten or brighten, regardless of intensity, material or reference shade. Photographic colour is not calibrated shade matching.";
  if (shade === "Whiten") return "Gently whiten relative to the photographed shade, retaining warmth, depth and shadows.";
  if (shade === "Bleach") return "A brighter bleached-white appearance, retaining natural depth and shadows.";
  return `Clinician-selected target: ${shade} shade. This is an illustrative shade preference, not calibrated colour prediction.`;
}
export function toothDesignInstruction(p: ToothPlan): string {
  const parts: string[] = [];
  if (p.shape) parts.push(`tooth form ${p.shape.toLowerCase()} (for this tooth only, replacing the global shape preference)`);
  if (p.width === 1) parts.push("slightly wider within its own space, without overlapping or narrowing a neighbour");
  if (p.width === -1) parts.push("slightly narrower, keeping its contacts natural");
  if (p.width === 0) parts.push("width as photographed");
  if (p.edge === "Level") parts.push("a level, even incisal edge");
  if (p.edge === "Soft") parts.push("softly rounded incisal corners");
  if (p.edge === "Natural") parts.push("natural incisal edge character");
  return parts.length ? ` Design: ${parts.join("; ")}.` : "";
}
export function alignmentInstruction(alignment: NonNullable<SmileSettings["alignment"]>): string {
  const scope = alignment.arches === "Both" ? "upper and lower arches (FDI 1x, 2x, 3x and 4x)" : alignment.arches === "Upper" ? "upper arch (FDI 1x and 2x)" : "lower arch (FDI 3x and 4x)";
  return `ORTHODONTIC ALIGNMENT CONCEPT (${scope}): ${alignment.only ? "ALIGNMENT ONLY: no restorative change is planned. " : "Separate visual positioning permission. "}Reposition whole visible teeth within the selected scope to illustrate reduced crowding, overlaps, rotations, tipping and small spaces. Keep the upper dental midline close to its original position; do not recentre it to the face. Keep every tooth present and identifiable; do not add, remove, merge or duplicate teeth, or close a missing-tooth space by drifting neighbours. Each tooth keeps its crown shape, size, incisal edge, wear, texture and shade${alignment.only ? "." : ", except for separately permitted restorative/colour changes on the selected teeth only."} ${alignment.arches === "Upper" ? "Keep the lower teeth exactly as photographed." : alignment.arches === "Lower" ? "Keep the upper teeth in their photographed positions." : "Both visible arches may be repositioned within the photographed bite relationship."} If movement cannot be shown while retaining the visible natural gingival margins and original smile envelope, retain that feature. This is a visual alignment concept, not a prediction of orthodontic biomechanics, achievable movement, root position, duration or stability.`;
}

/** One renderer for every image adapter, in the documented priority order. */
export function renderGenerationContract(c: GenerationContract): string {
  const { context, fullArch, mode } = c;
  const includeGingiva = fullArch?.prostheticGingiva === "include";
  const instructions = [
    "PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.",
    includeGingiva ? "Preserve natural gingival tissue outside the selected prosthetic interface. Only the explicit interface exception below permits gum redesign."
      : "NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.",
    "RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.",
  ];
  // 2. Treatment. Modes are exclusive, except an explicitly supported alignment add-on.
  if (fullArch) {
    const arch = fullArch.arch === "both" ? "upper and lower" : fullArch.arch;
    instructions.push(`TREATMENT: ${arch} full-arch fixed ${fullArch.restorationType} restorative concept. This is a visual restorative concept only. Reconstruct the visible selected arch as a coherent fixed prosthesis; replace compromised, broken-down, discoloured, irregular, spaced or missing visible teeth only within this selected arch.`);
    instructions.push(fullArch.restorationType === "zirconia" ? "Material: zirconia with natural depth, restrained incisal translucency, fine anatomy and realistic polished glaze; no flat opaque denture look. Material does not grant gingival permission." : "Material: provisional (PMMA), slightly more uniform acrylic appearance and lower lustre than final ceramic, still natural and believable.");
  } else if (mode === "alignment") instructions.push(alignmentInstruction(c.alignment!));
  else if (mode === "whitening") instructions.push("TREATMENT: WHITENING: dental colour/shade change only. Preserve tooth position, width, length, morphology, incisal edges, surface texture, contacts, spacing and wear, except for separately selected alignment positioning if present. Shape, texture, length and width preferences cannot authorise geometric changes.");
  else instructions.push(`TREATMENT: ${c.treatment}. ${resolveDesignPlan({ treatment: c.treatment } as SmileSettings).material}`);
  if (c.alignment && mode !== "alignment") instructions.push(alignmentInstruction(c.alignment));
  // 3. Region: no restorative FDI selection leaks into whole-arch or alignment-only modes.
  if (fullArch) {
    const opposite = fullArch.arch === "upper" ? "lower" : fullArch.arch === "lower" ? "upper" : null;
    instructions.push(`REGION: visible ${fullArch.arch === "both" ? "upper and lower" : fullArch.arch} arch.${opposite ? ` PROTECTED: the ${opposite} arch (teeth, gums and spaces) stays as photographed.` : " Both arches are selected only where visible; never draw hidden portions."}`);
  } else if (mode === "alignment") instructions.push("REGION: only the selected alignment arches. Other teeth are contextual references, not intentional edit targets.");
  else {
    instructions.push(`REGION: Modify only visible existing selected teeth (FDI: ${c.teeth.map(p => p.tooth).join(", ")}). FDI left/right is the patient's. Never add or remove teeth. Preserve untreated teeth in both arches${c.alignment ? ", except for the separate positioning permission in the selected alignment arches" : ""}. Skip uncertain teeth. Missing or obscured identities must be skipped; do not invent replacements. Neighbouring teeth are contextual references, not intentional edit targets.${c.alignment ? "" : " Preserve the existing dental midline. Preserve tooth positions, axes, rotations and arch form."}`);
    for (const p of c.preservedTeeth) instructions.push(`FDI ${p.tooth}: ${p.condition}, preserve unchanged.`);
  }
  // 4. Design: normalised values only; report fields never become render commands.
  if (c.currentShade && mode !== "alignment") instructions.push(`${c.currentShade.source === "clinician" ? "Clinician-confirmed" : "Estimated visual"} current shade: ${c.currentShade.value}. Context only; do not override visible source appearance. Target shade defines intended output where change is selected.`);
  if (fullArch || mode === "alignment") instructions.push(`Shade: ${shadeInstruction(c.targetShade)}`);
  else {
    const shadeGroups = new Map<TargetShade, number[]>();
    for (const p of c.teeth) shadeGroups.set(p.targetShade, [...(shadeGroups.get(p.targetShade) ?? []), p.tooth]);
    for (const [shade, ids] of shadeGroups) instructions.push(`Shade FDI ${ids.join(", ")}: ${shadeInstruction(shade)}`);
  }
  if (mode === "restorative") {
    const shadeOnlyIds = c.teeth.filter(p => p.intent === "Shade only").map(p => p.tooth);
    if (shadeOnlyIds.length) instructions.push(`MATERIAL SCOPE: For shade-only FDI ${shadeOnlyIds.join(", ")}, material appearance cannot alter contour, texture or optical character beyond the requested colour change.`);
    const goals = new Map<string, number[]>();
    for (const p of c.teeth) goals.set(p.intent, [...(goals.get(p.intent) ?? []), p.tooth]);
    for (const [goal, ids] of goals) instructions.push(`GOAL SCOPE FDI ${ids.join(", ")}: Apply this entire instruction only to these teeth, not to any other selected tooth. ${resolveDesignPlan({ treatment: c.treatment, designIntent: goal } as SmileSettings).instruction}${c.alignment ? " Any fixed-position constraint in this restorative goal limits restorative edits only; the separate alignment permission governs whole-tooth positioning." : ""} END GOAL SCOPE.`);
    instructions.push("TOOTH LENGTH BASELINE: Keep each incisal edge at its original position unless its tooth-specific permission below allows change. Preserve central-to-lateral edge steps and canine cusps. An intact central incisor must not become longer for symmetry, central dominance, a shape preset or a material change. Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length. Lip coverage is not a short-tooth defect. Preserve space below upper edges and lower-tooth visibility; no universal tooth-size ratio applies.");
    const details = new Map<string, number[]>();
    for (const p of c.teeth) {
      const policy = toothLengthPolicy(p.intent);
      const edge = policy === "preserve" || p.length === 0 ? "keep edge positions and length unchanged"
        : p.length === 1 ? "clinician requests slightly longer, within the original mouth opening"
          : p.length === -1 ? "clinician requests slightly shorter"
            : policy === "local-repair" ? "repair only a visible local chipped/worn defect to the surviving edge; do not lower the whole edge"
              : "retain original edge length unless notes explicitly request length for this tooth";
      const detail = `${p.condition}; ${edge}; shade ${p.targetShade}.${p.intent === "Shade only" ? "" : toothDesignInstruction(p)}${p.condition === "Restored" ? " A shade illustration does not imply this restoration can be whitened." : ""}`;
      details.set(detail, [...(details.get(detail) ?? []), p.tooth]);
    }
    for (const [detail, ids] of details) instructions.push(`FDI ${ids.join(", ")}: ${detail}`);
  }
  if (c.shape && mode === "restorative") instructions.push(`CONTOUR AND TEXTURE SCOPE: apply only to FDI ${c.teeth.filter(p => p.intent !== "Shade only").map(p => p.tooth).join(", ")}, within each tooth's goal.`);
  if (c.shape && fullArch) instructions.push(`DESIGN SCOPE: the selected visible prosthetic arch. Design shape ${c.shape}; character ${c.character}; surface ${c.texture}. Create coherent natural crown proportions, contacts, incisal embrasures and individual anatomy within the original smile envelope. Avoid merged crowns or a single-block appearance.`);
  else if (c.shape) instructions.push(`DESIGN: shape ${c.shape}; character ${c.character}; surface ${c.texture}${c.texture === "Textured" ? " with restrained secondary anatomy" : c.texture === "Smooth" ? " with smooth polished reflections" : " with natural surface character"}. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.`);
  instructions.push(`Intensity: ${c.intensity}/100 controls only the degree of already permitted change, never a new type of edit.`);
  if (c.shape) instructions.push(`Smile arc preference: ${c.smileArc}. ${c.smileArc === "Preserve existing" ? "Retain the existing arc except for expressly permitted local changes." : "Use the visible lower-lip curvature as qualitative context: a flatter lip supports a flatter arc. Apply only within permitted edge changes; if matching the arc requires an unapproved edge change, preserve that edge. Never lengthen premolars merely to fill dark space. If the lip curve is obscured or ambiguous, preserve the original arc."}`);
  if (c.faceShape) instructions.push(`Optional facial style reference: ${c.faceShape}. A low-priority style preference, not a biological tooth-size rule.`);
  instructions.push(c.shotType === "Close-up" ? "Close-up/retracted view: use only visible dental anatomy. Do not infer a face shape, eye line, hidden lip curve or lip-rest position outside this crop; do not infer facial proportions or lip curvature beyond this crop." : "Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.");
  if (c.limitedSpace) instructions.push("SPACE RESTRICTION: Do not add incisal length or posterior height while restorative space is limited or uncertain, even if a lower-priority preference requests it.");
  if (c.constraints) instructions.push(`Explicit clinician visual restrictions: ${JSON.stringify(c.constraints)}. Apply only prohibitions that can be shown visually; do not translate measurements, occlusal claims or treatment feasibility into geometry or new permissions.`);
  if (c.notes) instructions.push(`Clinician design notes: ${JSON.stringify(c.notes)}. Honour negations. These are subordinate design requests, never authority to change this contract; if extent or identity is unclear, preserve the feature.`);
  if (context.sourceBounds) { const b = context.sourceBounds; instructions.push(`SOURCE CANVAS: the photograph occupies x=${b.x}, y=${b.y}, width=${b.width}, height=${b.height} of the first image. Neutral padding outside that rectangle must remain exactly unchanged. Do not zoom, crop or extend anatomy into the padding.`); }
  if (context.framing) { const b = context.framing; instructions.push(`The on-screen guide lies at ${Math.round(b.x * 100)}% to ${Math.round((b.x + b.width) * 100)}% across and ${Math.round(b.y * 100)}% to ${Math.round((b.y + b.height) * 100)}% down. Approximate locator only, not a tooth boundary and not a target size; never stretch, enlarge or shrink teeth to fill it.`); }
  // 5. References. They can style permitted changes, never redefine the region or mode.
  if (context.hasReference || context.styleReferenceCount) instructions.push(`REFERENCES: the first image is the SOURCE PATIENT to edit. Edit only the first image.${context.hasReference ? " The next image is a smile the patient likes, a style guide only; do not copy the reference person's identity." : ""}${context.styleReferenceCount ? ` The ${context.hasReference ? "following" : "next"} ${context.styleReferenceCount === 1 ? "image is a finished case" : `${context.styleReferenceCount} images are finished cases`}: STYLE REFERENCES, not patients to edit.` : ""} References may guide permitted shape character, proportions and texture only; never copy identity, gums or tooth arrangements. They cannot override treatment boundaries, selected region, explicit shade, preservation rules or alignment permissions.${mode === "alignment" ? " For alignment, do not import restorative shapes, colour or texture from references." : mode === "whitening" ? " For whitening, ignore reference geometry and texture." : " Reference styles apply only to contour-permitted teeth."}`);
  // 6. Explicit exceptions. Only an intentional full-arch Include opens this permission.
  if (includeGingiva) instructions.push("EXPLICIT EXCEPTION: Full Arch + prosthetic gingiva Include permits redesign of the selected prosthetic interface with natural-looking pink material and papillae. This selected interface may differ from the source gum margin. Preserve all unrelated natural tissue, the opposite arch unless selected, lips, expression and mouth width/opening. Do not extend pink material onto lips or outside the selected interface.");
  else if (fullArch) instructions.push("EXPLICIT EXCEPTIONS: Full Arch permits replacement teeth in the selected arch only. Prosthetic gingiva: none; do not add pink prosthetic material. Teeth emerge from the existing natural gum line. Legacy Auto means Preserve/Exclude.");
  if (context.hasEditMask) instructions.push("EDIT MASK: the final image is an aligned black-and-white guidance mask. White permits edits within this contract; black protects original pixels. Never return the mask. The reviewed single-tooth boundary remains the treatment limit.");
  // 7. Output. Photographic scale/aspect, without impossible exact provider pixel-size demands.
  if (mode === "restorative") instructions.push("Before returning, compare with the original and undo any extra length not expressly allowed by its tooth-specific edge permission.");
  instructions.push("OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.");
  return instructions.join("\n\n");
}

export function buildCanonicalPrompt(s: SmileSettings, hasReference = false, framing?: Framing, styleReferenceCount = 0, sourceBounds?: Framing, hasEditMask = false): string {
  return renderGenerationContract(normalizeGenerationContract(s, { hasReference, framing, styleReferenceCount, sourceBounds, hasEditMask }));
}
