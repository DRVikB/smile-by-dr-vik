import type { DesignIntent, TargetShade, ToothPlan, Treatment } from "../types";
import { toothLengthPolicy } from "./designPlan";
import type { GenerationContract } from "./contract";

/**
 * The Sunburst image-edit instruction, rendered from the same normalised contract
 * as every other adapter. Plain language for an image model: teeth are named
 * (FDI in brackets), each permission is stated once, and everything not listed
 * is kept. No legal or clinical-disclaimer prose; that belongs in the app.
 */

const SIDE: Record<number, string> = { 1: "upper right", 2: "upper left", 3: "lower left", 4: "lower right" };
const TOOTH: Record<number, string> = { 1: "central incisor", 2: "lateral incisor", 3: "canine", 4: "first premolar", 5: "second premolar", 6: "first molar", 7: "second molar", 8: "third molar" };
export function toothName(fdi: number): string {
  const side = SIDE[Math.floor(fdi / 10)], tooth = TOOTH[fdi % 10];
  return side && tooth ? `${side} ${tooth} (${fdi})` : `tooth ${fdi}`;
}

const GROUPS: Array<[number[], string]> = [
  [[12, 11, 21, 22], "the four upper incisors"],
  [[13, 12, 11, 21, 22, 23], "the six upper front teeth, canine to canine"],
  [[14, 13, 12, 11, 21, 22, 23, 24], "the eight upper front teeth, first premolar to first premolar"],
  [[15, 14, 13, 12, 11, 21, 22, 23, 24, 25], "the ten upper front teeth, second premolar to second premolar"],
];
function describeTeeth(ids: number[]): string {
  const names = ids.map(toothName).join(", ");
  const group = GROUPS.find(([g]) => g.length === ids.length && g.every(t => ids.includes(t)))?.[1];
  return group ? `${group}: ${names}` : names;
}

function shade(target: TargetShade): string {
  if (target === "The same") return "keep the current colour exactly; do not whiten or brighten";
  if (target === "Whiten") return "a few shades whiter than now, still natural, keeping warmth, depth and shadows";
  if (target === "Bleach") return "bright bleached white, still with natural depth and shadows (not flat paper-white)";
  return `VITA ${target}, with natural depth, warmth and shadows`;
}

function strength(intensity: number): string {
  const word = intensity <= 33 ? "subtle" : intensity <= 66 ? "moderate" : "pronounced";
  return `${intensity}/100: make the permitted change ${word}. Strength never adds a new kind of change.`;
}

const MATERIAL: Record<Treatment, string> = {
  Whitening: "teeth whitening",
  Composite: "composite bonding: a natural resin look with a polished surface. Material is only added to teeth, never removed",
  "Single-shade composite": "single-shade composite bonding: one body shade with natural depth, not flat or opaque; no separate layers, halo edges or fake mamelons. Material is only added to teeth, never removed",
  "Layered composite": "layered composite bonding: subtle depth from gum to biting edge and slight translucency at the edge; not automatically whiter or longer. Material is only added to teeth, never removed",
  Porcelain: "porcelain veneers: a ceramic finish with natural light transmission and subtle shade transitions; not bulky, not automatically whiter or more symmetrical",
};

const GOAL: Record<DesignIntent, string> = {
  "Shade only": "colour only. Keep each tooth's outline, biting edge, size, contacts, gaps, wear, surface texture and position exactly as photographed.",
  Auto: "make the smallest improvement the photo supports: refine small surface or outline irregularities only. Keep size, gaps, positions and edge lengths. If the clinician's notes ask for something specific (colour only, repairing chips, closing gaps, reshaping), do exactly that and no more.",
  "Repair edges": "rebuild only chipped or worn biting edges, continuing the line of that tooth's surviving edge. Do not lengthen intact teeth or change widths and gaps. If no chip or wear is visible, leave the edge alone.",
  "Close gaps": "widen the teeth sideways into the visible gaps between them. Keep edge lengths, positions and gums. Never fill a missing-tooth space; leave some space if full closure would look bulky.",
  Reshape: "modestly reshape the biting edges and sides toward the chosen shape. Keep each tooth in its place, on its axis and within the current arch width; do not enlarge every tooth or level the gums.",
};

function edge(p: ToothPlan & { intent: string }): string | undefined {
  const policy = toothLengthPolicy(p.intent as DesignIntent);
  if (policy === "preserve" || p.length === 0) return undefined;
  if (p.length === 1) return "slightly longer, staying inside the current mouth opening";
  if (p.length === -1) return "slightly shorter";
  return undefined;
}
function toothDetails(p: ToothPlan & { intent: string }): string[] {
  const parts: string[] = [];
  if (p.intent !== "Shade only") {
    const e = edge(p); if (e) parts.push(e);
    if (p.shape) parts.push(`${p.shape.toLowerCase()} shape (this tooth only)`);
    if (p.width === 1) parts.push("slightly wider within its own space, without overlapping a neighbour");
    if (p.width === -1) parts.push("slightly narrower, keeping natural contacts");
    if (p.edge === "Level") parts.push("a level, even biting edge");
    if (p.edge === "Soft") parts.push("softly rounded edge corners");
  }
  if (p.condition === "Restored") parts.push("this tooth has an existing restoration");
  return parts;
}

const ARC: Record<string, string> = {
  "Follow lower lip": "let the biting edges follow the curve of the lower lip",
  Flatter: "a slightly flatter smile line, guided by the curve of the lower lip",
  "More curved": "a slightly more curved smile line that follows the lower lip",
};
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
function design(c: GenerationContract): string {
  return `${(c.shape ?? "natural").toLowerCase()} shape, ${(c.character ?? "balanced").toLowerCase()} character, ${(c.texture ?? "natural").toLowerCase()} surface`;
}

export function renderSunburstPrompt(c: GenerationContract): string {
  const { fullArch, mode, context } = c;
  const includeGingiva = fullArch?.prostheticGingiva === "include";
  const closeUp = c.shotType === "Close-up";
  const selected = c.teeth.map(p => p.tooth);
  const change: string[] = [], keep: string[] = [];

  // WHAT TO CHANGE
  if (fullArch) {
    change.push("Treatment: full-arch zirconia restoration of the visible upper and lower teeth. Replace the visible teeth with a new, coherent set of fixed zirconia teeth: individual crowns with natural proportions, contacts and small gaps between the edges, and a recognisable canine on each side. Natural depth, slight translucency at the biting edges and a polished glaze; not a flat denture look and never one solid block.");
    if (c.shape) change.push(`Design: ${design(c)}.`);
    change.push(`Shade: ${shade(c.targetShade)}.`);
    change.push(includeGingiva
      ? "Gums: you may add natural-looking pink prosthetic gum, with papillae, where the new teeth meet the gums. Keep it off the lips and leave all other natural gum as photographed."
      : "Gums: the new teeth come out of the existing natural gum line. Do not add pink prosthetic material and do not change the gums.");
  } else if (mode === "alignment") {
    change.push("Treatment: straighten the teeth (alignment concept) in both arches. Move whole teeth to reduce crowding, overlaps, rotations, tipping and small gaps. Keep the upper midline close to where it is.");
    change.push("Every tooth stays present and recognisable: do not add, remove, merge or duplicate teeth, and do not close a missing-tooth space by drifting neighbours. Each tooth keeps its own shape, size, biting edge, wear, texture and colour.");
  } else {
    if (selected.length) change.push(`Teeth to edit: ${describeTeeth(selected)}. The patient's right side is on the left of the image.`);
    change.push(`Treatment: ${mode === "whitening" ? "teeth whitening, colour only. Keep each tooth's outline, biting edge, size, texture, gaps and position exactly as photographed." : `${MATERIAL[c.treatment ?? "Composite"]}.`}`);
    if (mode === "restorative") {
      const goals = new Map<string, number[]>();
      for (const p of c.teeth) goals.set(p.intent, [...(goals.get(p.intent) ?? []), p.tooth]);
      for (const [goal, ids] of goals) change.push(`${goals.size > 1 ? `Goal for ${ids.map(toothName).join(", ")}` : "Goal"}: ${GOAL[goal as DesignIntent]}`);
      if (c.teeth.some(p => p.intent !== "Shade only") && c.shape) change.push(`Design (only where the goal allows outline changes): ${design(c)}.${c.teeth.length > 1 ? " Keep the natural size steps between central incisors, lateral incisors and canines, small gaps at the edge corners and each canine's pointed tip; each tooth looks individual, never identical copies." : " Keep it in harmony with the neighbouring teeth."}`);
      const exceptions = [
        c.teeth.some(p => edge(p)) && "where a tooth line below says otherwise",
        c.teeth.some(p => toothLengthPolicy(p.intent as DesignIntent) === "local-repair") && "when rebuilding a chipped or worn edge as described",
        c.notes && c.teeth.some(p => toothLengthPolicy(p.intent as DesignIntent) === "explicit-request" && !p.length) && "where the clinician's notes ask for a specific tooth to be longer",
      ].filter(Boolean);
      change.push(`Tooth length: keep every biting edge exactly where it is${exceptions.length ? `, except ${exceptions.length > 1 ? `${exceptions.slice(0, -1).join(", ")} or ${exceptions.at(-1)}` : exceptions[0]}` : ""}. Do not lengthen teeth for symmetry or because of the shape choice. Keep the space below the upper edges and how much of the lower teeth shows.`);
    }
    const shades = new Map<TargetShade, number[]>();
    for (const p of c.teeth) shades.set(p.targetShade, [...(shades.get(p.targetShade) ?? []), p.tooth]);
    for (const [target, ids] of shades) change.push(`${shades.size > 1 ? `Shade for ${ids.map(toothName).join(", ")}` : "Shade"}: ${shade(target)}.`);
    if (c.whitening) change.push("Whitening is included: whiten only the teeth being edited; every other tooth keeps its current colour.");
    if (c.currentShade) change.push(`Current shade, for reference only: ${c.currentShade.value}.`);
    for (const p of c.teeth) {
      const details = toothDetails(p);
      if (details.length) change.push(`${capitalise(toothName(p.tooth))}: ${details.join("; ")}.`);
    }
    if (c.alignment) change.push("Also straighten the teeth (alignment concept) in both arches: move whole teeth to reduce crowding, overlaps and rotations, keeping the upper midline close to where it is. Do not add, remove, merge or duplicate teeth.");
  }
  change.push(`Strength: ${strength(c.intensity)}`);
  if (c.shape && ARC[c.smileArc]) change.push(`Smile line: ${ARC[c.smileArc]}${fullArch ? "" : ", only within the edge changes allowed above"}. If the lip curve is unclear, keep the current smile line.`);
  if (c.faceShape) change.push(`Optional style hint, low priority: ${c.faceShape.toLowerCase()} face shape.`);
  if (c.limitedSpace) change.push("Restorative space is limited: add no length or height to any tooth.");
  if (c.constraints) change.push(`Clinician restrictions, which must be followed: ${JSON.stringify(c.constraints)}.`);
  if (c.notes) change.push(`Clinician notes: ${JSON.stringify(c.notes)}. Follow them only within the limits above, and honour anything they say not to do.`);

  // KEEP EXACTLY AS PHOTOGRAPHED
  if (!fullArch && mode !== "alignment") {
    keep.push(c.alignment
      ? "Every tooth not listed above, including all lower teeth: same shape, size, colour and visibility; they may only be moved as part of the straightening. Do not remove, hide, redraw or whiten them."
      : "Every tooth not listed above, including all lower teeth: same position, shape, size, colour and visibility. Do not remove, hide, redraw, straighten or whiten them.");
    for (const p of c.preservedTeeth) keep.push(`${capitalise(toothName(p.tooth))}: ${p.condition === "Missing" ? "missing; leave the space exactly as it is" : "leave unchanged"}.`);
  }
  if (!fullArch) keep.push("Gums: the same gum line, shape, colour and texture, including any recession, dark triangles between teeth or asymmetry.");
  keep.push("Lips and mouth: do not open the mouth wider, widen the smile or move the lips. Show the same amount of upper and lower teeth; never reveal teeth hidden behind the lips.");
  keep.push("Bite: keep how the upper and lower teeth meet.");
  keep.push(`${closeUp ? "Everything outside the teeth: cheek retractors, lips, tongue, lighting, camera angle and framing." : "The person: identity, face, expression, skin, eyes, hair, clothing, background, lighting, camera angle and framing."}`);

  const references: string[] = [];
  if (context.hasReference) references.push("Image 2 is a smile the patient likes. Use it only as a style hint for tooth shape and texture; never copy that person or their gums.");
  if (context.styleReferenceCount) {
    const first = context.hasReference ? 3 : 2, last = first + context.styleReferenceCount - 1;
    references.push(`${first === last ? `Image ${first} is a finished case` : `Images ${first} ${last - first === 1 ? "and" : "to"} ${last} are finished cases`} from this clinician. Match only the finish (surface, translucency, proportions), never their tooth arrangement, gums or identity.`);
  }
  if (references.length && mode === "alignment") references.push("For straightening, do not take shapes or colours from these images.");
  if (references.length && mode === "whitening") references.push("For whitening, take nothing but colour character from these images.");

  const padded = context.sourceBounds && (context.sourceBounds.x > 0 || context.sourceBounds.y > 0 || context.sourceBounds.width < 1 || context.sourceBounds.height < 1);
  return [
    `Edit image 1, ${closeUp ? "a close-up dental photo" : "a portrait photo"}. Change only the teeth as described below; every other part of the photo must stay exactly as it is.`,
    "",
    "WHAT TO CHANGE",
    ...change.map(line => `- ${line}`),
    "",
    "KEEP EXACTLY AS PHOTOGRAPHED",
    ...keep.map(line => `- ${line}`),
    ...(references.length ? ["", "OTHER IMAGES", ...references.map(line => `- ${line}`)] : []),
    "",
    "MASK",
    `- The transparent part of the mask is where edits are allowed: the teeth inside the existing mouth opening. It can cover more than the teeth being changed. Inside it, change only what is listed above and leave everything else as photographed: ${fullArch ? "tongue and dark spaces" : "other teeth, gums, tongue and dark spaces"}.`,
    "- The lips and jaw are outside the mask: keep them exactly where they are. The mouth stays open exactly as much as in the photo; fit the teeth inside that opening.",
    "",
    "RESULT",
    `- Return the complete photo at the same framing and scale: never ${closeUp ? "a tighter crop" : "a close-up, crop"}, collage or mask.${padded ? " Leave the thin grey padding bands at the image edges untouched." : ""}`,
    "- The teeth must look real in this photo: the same lighting, white balance, shadows (including the shadow under the upper lip), grain and sharpness, with no visible seams. Keep natural variation between teeth; no merged, duplicated or floating teeth, no plastic look.",
  ].join("\n");
}
