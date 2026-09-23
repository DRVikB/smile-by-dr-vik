import { activeToothPlans, resolvedToothIntent } from "../teeth";
import type { DesignIntent, SmileSettings, Treatment } from "../types";

export const DESIGN_INTENTS: DesignIntent[] = ["Auto", "Shade only", "Repair edges", "Close gaps", "Reshape"];

const GOALS: Record<DesignIntent, { summary: string; instruction: string }> = {
  Auto: {
    summary: "Use notes and visible anatomy; otherwise refine conservatively.",
    instruction: "AUTO: Choose the smallest change supported by the visible selected teeth and the clinician's notes. If notes explicitly request colour only, follow SHADE ONLY: change colour without changing outlines, edge positions, texture or contacts. If notes explicitly request edge repair, follow REPAIR EDGES: add only at the visibly chipped or worn incisal edge; do not close gaps. If notes explicitly request gap closure, follow CLOSE GAPS: permit proximal additions only into visible gaps between selected existing teeth; do not lengthen their edges. If both are explicitly requested, combine those local permissions without moving teeth. If notes explicitly request broader reshaping, allow modest visible contour changes within the existing arch, preserving roots/axes and gums. Without a clear request, retain overall dimensions, gaps, tooth positions and wear; refine only small surface/contour irregularities. Never invent a problem or a missing tooth to justify an edit. Treat negated requests as prohibitions, not as permission. If the notes conflict or the requested extent cannot be judged, preserve that feature instead of guessing.",
  },
  "Shade only": {
    summary: "Change shade; keep tooth shape, edges, texture and gaps unchanged.",
    instruction: "SHADE ONLY: Change only the colour of selected teeth. Keep every tooth outline, contact, gap, incisal edge, wear facet, surface texture and position exactly as photographed. Ignore shape, character, face-style, intensity-driven reshaping and conflicting notes/reference geometry. Material selection must not alter contours or add new texture in this mode.",
  },
  "Repair edges": {
    summary: "Allow local edge additions; preserve gaps, tooth positions and gums.",
    instruction: "REPAIR EDGES: Permit local incisal additions only where a selected existing tooth shows chipping or wear and the clinician requests repair. The original silhouette may extend at that damaged edge; it is not a universal no-growth boundary. Use that tooth's remaining anatomy and a visible intact counterpart as references, not an instruction to mirror the smile. Keep proximal width and gaps unchanged. Do not lengthen an intact tooth or reconstruct a whole missing tooth. If no supported edge repair is visible, preserve the edge.",
  },
  "Close gaps": {
    summary: "Allow additions into visible gaps; preserve edge length and gum tissue.",
    instruction: "CLOSE GAPS: Permit proximal contour additions into visible spaces between selected existing teeth. Existing tooth outlines may expand only into those spaces; keep incisal edge length unchanged. Preserve the teeth's underlying positions, axes and arch. Do not erase papillae, move the gum line or paint over recession. A black triangle may be reduced only by plausible tooth-contour additions, never by inventing gum tissue. If complete closure would create an excessive contour, retain some space. Never fill a missing-tooth space as though it were a small gap.",
  },
  Reshape: {
    summary: "Allow planned contour changes; preserve tooth positions, gums and arch.",
    instruction: "RESHAPE: Permit modest changes to incisal and proximal contours of selected existing teeth, following the requested form and clinician's notes. Growth is allowed only where that specific design requires it, within the visible mouth opening and existing arch. Do not expand the whole arch, move roots/axes, level the gums or enlarge all teeth simply to increase intensity. Do not reconstruct missing or heavily broken-down teeth from guesswork. Where feasibility depends on unseen bite, preparation or thickness, choose the smaller visible change and leave clinical feasibility for assessment.",
  },
};

const MATERIAL: Record<Treatment, string> = {
  Composite: "Composite technique is unspecified in this legacy case. Use restrained composite surface realism without assuming single-shade or a layered recipe. Keep the design additive; do not simulate tooth movement or hidden tooth reduction.",
  "Single-shade composite": "Single-shade composite means a clinician-selected single-shade bonding technique, not necessarily a universal one-shade product. Use one body shade with plausible blending and light-dependent depth. Do not add an elaborate separate dentine/enamel layering pattern, exaggerated incisal halo or fabricated mamelons. It must not look artificially flat or opaque. Keep the design additive; if the requested contour would require reduction or movement, preserve that feature. Unknown substrate, thickness and product prevent an exact optical prediction.",
  "Layered composite": "Layered composite: allow restrained dentine/body/enamel depth, cervical-to-incisal transitions and incisal translucency appropriate to the chosen texture and supplied comparable cases. Do not automatically make this option whiter, longer or better shaped. Keep the design additive; do not simulate hidden reduction or orthodontic movement. Do not invent a particular resin recipe or thickness.",
  Porcelain: "Porcelain: depict a ceramic restoration with plausible surface finish, light transmission and shade transitions, keeping the selected geometry and shade. Do not make it automatically whiter, bulkier or more symmetrical than composite. Unknown ceramic type, substrate/stump shade, thickness and cement mean the appearance is illustrative, not a material-specific colour prediction. A veneer may change visible contours within the approved goal, but must not imply that root position, bite, preparation needs or gum levels have changed.",
};

export function resolveDesignPlan(settings: SmileSettings) {
  const intent = settings.designIntent ?? "Auto";
  return { intent, ...GOALS[intent], material: MATERIAL[settings.treatment],
    colourOnly: intent === "Shade only", useFacialGuides: settings.shotType === "Full face" && intent !== "Shade only" };
}

export function isNoChangeDesign(s: SmileSettings): boolean {
  return activeToothPlans(s).every(p => resolvedToothIntent(s, p) === "Shade only" && (p.targetShade ?? s.targetShade) === "The same");
}
