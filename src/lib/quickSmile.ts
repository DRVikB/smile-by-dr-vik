import { upperTeeth, type SmileSettings } from "./types";
import { chooseAlignment, chooseFullArch, chooseStandard } from "./fullArch";
import { withToothMatch } from "./smileDesign/toothMatch";

/**
 * Quick Smile: one tap from the photo to a result. Each goal is a complete,
 * sensible design built on the clinician's current preferences (shape, shade,
 * library style); the studio refines it afterwards.
 */
export type QuickGoal = "whiten" | "veneers" | "straighten" | "one-tooth" | "full-arch";

export const QUICK_GOALS: { goal: QuickGoal; title: string; detail: string }[] = [
  { goal: "whiten", title: "Whiten", detail: "Colour only · instant" },
  { goal: "veneers", title: "Veneers", detail: "8 upper teeth" },
  { goal: "straighten", title: "Straighten", detail: "Both arches" },
  { goal: "one-tooth", title: "Fix one tooth", detail: "Chipped or missing" },
  { goal: "full-arch", title: "Full arch", detail: "All-on-X" },
];

/** A tooth is chosen in the studio; every other goal generates straight away. */
export const goalNeedsStudio = (goal: QuickGoal) => goal === "one-tooth";

export function quickSmileSettings(goal: QuickGoal, current: SmileSettings): SmileSettings {
  // A fresh scope: no single-tooth plan or per-tooth instructions carried over.
  const base: SmileSettings = { ...current, toothMatch: undefined, toothPlans: undefined, teeth: 8, selectedTeeth: upperTeeth[8] };
  const shade = current.targetShade === "The same" ? "Whiten" : current.targetShade;
  switch (goal) {
    case "whiten": return chooseStandard(base, { treatment: "Whitening", whitening: undefined, alignment: undefined, targetShade: shade });
    case "veneers": return chooseStandard(base, { treatment: current.treatment === "Whitening" ? "Porcelain" : current.treatment, whitening: undefined, alignment: undefined, designIntent: "Auto" });
    case "straighten": return chooseAlignment(base);
    case "one-tooth": return withToothMatch(chooseStandard(base, { alignment: undefined, whitening: undefined, treatment: current.treatment === "Whitening" ? "Single-shade composite" : current.treatment }), { tooth: 21, missing: false });
    case "full-arch": return chooseFullArch(base);
  }
}
