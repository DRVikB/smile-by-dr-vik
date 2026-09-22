import type { GenerationResult, SmileSettings } from "./types";

/**
 * "What this would take": the treatment a preview implies, worked out from
 * the design settings with fixed rules — no AI call, so it costs nothing and
 * says the same thing every time for the same choices.
 *
 * A preview only shows a possibility. This is what keeps it honest: the
 * patient sees what getting there would involve, and what still has to be
 * checked in person.
 */
export interface Implication {
  title: string;
  detail: string;
}

export interface TreatmentImplications {
  items: Implication[];
  /** Always checked at assessment — a photograph can't show any of these. */
  confirm: string[];
}

// Lightest last. "Whiten" and "Bleach" are always lighter than today.
const SHADE_ORDER = ["A3", "A2", "A1", "B1", "BL3", "BL2", "BL1"];

export function impliesWhitening(settings: Pick<SmileSettings, "currentShade" | "targetShade">): boolean {
  const { currentShade, targetShade } = settings;
  if (targetShade === "The same") return false;
  if (targetShade === "Whiten" || targetShade === "Bleach") return true;
  return SHADE_ORDER.indexOf(targetShade) > SHADE_ORDER.indexOf(currentShade);
}

export const CONFIRM_AT_ASSESSMENT = [
  "Bite and tooth wear",
  "Gum health and gum levels — not changed in this preview",
  "Existing fillings, crowns and any decay",
  "Crowding or rotations that may suit aligners first",
  "Enamel quality and thickness",
];

export function treatmentImplications(
  settings: SmileSettings,
  result?: Pick<GenerationResult, "scaleFlag">,
): TreatmentImplications {
  const n = settings.selectedTeeth.length || settings.teeth;
  const items: Implication[] = [];

  items.push(
    settings.treatment === "Porcelain"
      ? {
          title: `Porcelain veneers on ${n} upper teeth`,
          detail:
            "Usually needs some enamel shaping, which can’t be undone. Made by a lab, with temporary veneers in between — typically two or three visits.",
        }
      : {
          title: `Composite bonding on ${n} upper teeth`,
          detail:
            "Usually added to the tooth surface, so little or no enamel needs removing. Needs periodic polishing, and occasional repair or replacement over the years.",
        },
  );

  if (n >= 8)
    items.push({
      title: "Includes the premolars",
      detail:
        "Treating the premolars broadens the smile. If they sit inward, a fuller result may need orthodontic alignment first, or more material.",
    });

  if (impliesWhitening(settings))
    items.push({
      title: "Whitening first",
      detail:
        "Bonding and porcelain don’t whiten, so natural teeth are usually whitened first and the shade matched afterwards — including untreated teeth that show when smiling.",
    });

  if (settings.intensity >= 60)
    items.push({
      title: "A bigger change in shape",
      detail:
        "Worth a trial smile made from a wax-up, so the new shape can be tried in the mouth before anything is committed.",
    });
  else if (settings.intensity <= 25)
    items.push({
      title: "A subtle refinement",
      detail:
        "Stays close to the current tooth size and shape — usually the most conservative way to get there.",
    });

  if (result?.scaleFlag === "grew")
    items.push({
      title: "Longer or larger than today",
      detail:
        "This version reads larger than the patient’s own teeth. Extra length affects the bite and speech and needs checking — some of it may not be achievable.",
    });

  return { items, confirm: CONFIRM_AT_ASSESSMENT };
}
