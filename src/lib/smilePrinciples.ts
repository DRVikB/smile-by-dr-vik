import { activeToothPlans, resolvedToothIntent } from "./teeth";
import type { SmileSettings } from "./types";

/** Arc preferences cannot expand the permissions of an individual tooth goal. */
export function canGuideSmileArc(settings: SmileSettings): boolean {
  if (settings.alignment?.only || settings.shotType !== "Full face") return false;
  if (settings.treatmentMode === "full_arch" && settings.fullArch) return settings.fullArch.arch !== "lower";
  return activeToothPlans(settings).some(p => {
    const goal = resolvedToothIntent(settings, p);
    return p.tooth < 30 && (goal === "Auto" || goal === "Reshape");
  });
}

export function smileArcSummary(settings: SmileSettings): string {
  const arc = settings.smileArc ?? "Preserve existing";
  if (arc === "Preserve existing") return "Preserve existing";
  if (!canGuideSmileArc(settings)) return `${arc} · not applied with this photo / tooth plan`;
  return `${arc} · within permitted edge changes`;
}

export function smilePrinciplesInstruction(settings: SmileSettings): string {
  const arc = settings.smileArc ?? "Preserve existing";
  const bite = settings.biteContext ?? "Not assessed";
  const guidance = arc === "Preserve existing"
    ? "Retain the patient's existing smile arc; only specifically permitted local repairs or clinician-planned edge changes may alter it."
    : !canGuideSmileArc(settings)
      ? `The ${arc} preference is inactive for this photo/tooth plan. Preserve the existing arc; do not infer a lip curve outside a close-up.`
      : `${arc === "Follow lower lip"
        ? "Use the visible inner contour of the lower lip as a qualitative reference: a flatter lip supports a flatter arc preference; a curved lip supports a gently curved arc preference. Follow its general curvature, not its exact position."
        : arc === "Flatter"
          ? "The clinician prefers a flatter upper smile arc, not a straight uniform row. Retain individual tooth character."
          : "The clinician prefers a gently more curved upper smile arc. Do not create this by automatically lengthening the central incisors."} Apply this only to upper teeth with permitted edge changes. It is subordinate to tooth-specific goals and length permissions: if matching the arc requires an unapproved edge change, preserve that edge. Keep clearance from the lower lip, buccal corridors, gingiva and lower-tooth visibility. Never lengthen premolars merely to fill dark space. Account for photographed perspective and head tilt; do not infer millimetres, bite clearance or a target curvature from the image. If the lower lip is obscured or its curve ambiguous, preserve the original arc.`;
  return `SMILE PRINCIPLES: ${guidance} BITE CONTEXT (clinician supplied): ${bite}. This is context, not permission for bite correction. Preserve the photographed relationship of both arches; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. A single smile photograph does not establish occlusal contacts or available restorative space. A lip-arc preference must never imply that a deep bite is corrected or that posterior additions are feasible. Where the requested result would require orthodontic movement or unavailable bite information, retain that feature for clinical planning.`;
}
