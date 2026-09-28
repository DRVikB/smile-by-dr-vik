import type { CaseMaterial, SmileSettings, Treatment } from "./types";

/**
 * Case Library style matching: which of the clinician's own finished cases to
 * attach to a generation as style references.
 *
 * Runs on the server for the actual request (the client never chooses the
 * images sent to the AI provider) and on the device for the Compose preview
 * ("3 matching references"), so both agree.
 *
 * Priority:
 *   1. material / treatment      required: an incompatible material is never used
 *   2. teeth / treatment region  tooth overlap (a case with no overlapping teeth is not used)
 *   3. number of teeth           closer counts score higher
 *   4. starting condition        shared conditions (wear, gaps, dark shade…)
 *   5. recency                   tie-break
 * Unknown details neither help nor exclude: clinicians aren't made to fill in forms.
 */
export interface StyleReferenceCandidate {
  id: string;
  material: CaseMaterial;
  teethTreated?: number[];
  startingConditions?: string[];
  createdAt: number;
  validationOnly?: boolean;
}

export interface StyleMatch { id: string; score: number }

/** Default references per generation; configurable on the server (STYLE_REFERENCE_LIMIT). */
export const DEFAULT_STYLE_REFERENCE_LIMIT = 3;
/** Hard ceiling, whatever the configuration (request size and model guidance). */
export const MAX_STYLE_REFERENCE_LIMIT = 5;

export function styleReferenceLimit(value: string | number | undefined | null): number {
  const n = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_STYLE_REFERENCE_LIMIT;
  return Math.max(1, Math.min(MAX_STYLE_REFERENCE_LIMIT, Math.trunc(n)));
}

/** Legacy generic "Composite" pools both composite techniques; otherwise the technique must match. */
export function materialCompatible(material: CaseMaterial, treatment: Treatment): boolean {
  return treatment === "Composite" ? material !== "Porcelain" : material === treatment;
}

type MatchSettings = Pick<SmileSettings, "treatment" | "selectedTeeth"> & Partial<Pick<SmileSettings, "caseFeatures">>;

export function styleMatchScore(candidate: StyleReferenceCandidate, settings: MatchSettings): number | null {
  if (candidate.validationOnly) return null;
  if (!materialCompatible(candidate.material, settings.treatment)) return null;
  let score = settings.treatment === "Composite" ? 80 : 100;

  const teeth = candidate.teethTreated ?? [];
  const selected = settings.selectedTeeth ?? [];
  if (teeth.length && selected.length) {
    const overlap = teeth.filter(id => selected.includes(id)).length;
    if (overlap === 0) return null; // a different region is not a relevant style reference
    score += 30 * (overlap / new Set([...teeth, ...selected]).size);
    score += 10 * (1 - Math.abs(teeth.length - selected.length) / Math.max(teeth.length, selected.length));
  }

  const conditions = candidate.startingConditions ?? [];
  const wanted = settings.caseFeatures ?? [];
  if (conditions.length && wanted.length) score += 10 * Math.min(3, conditions.filter(c => wanted.includes(c as never)).length);
  return score;
}

/** The strongest relevant references, best first; empty when nothing is a close match. */
export function findMatchingStyleReferences(
  candidates: StyleReferenceCandidate[],
  settings: MatchSettings,
  limit = DEFAULT_STYLE_REFERENCE_LIMIT,
): StyleMatch[] {
  return candidates
    .map(candidate => ({ candidate, score: styleMatchScore(candidate, settings) }))
    .filter((m): m is { candidate: StyleReferenceCandidate; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score || b.candidate.createdAt - a.candidate.createdAt)
    .slice(0, Math.max(0, Math.min(MAX_STYLE_REFERENCE_LIMIT, limit)))
    .map(({ candidate, score }) => ({ id: candidate.id, score: Math.round(score * 10) / 10 }));
}
