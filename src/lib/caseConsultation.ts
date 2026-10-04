/**
 * Case-level consultation record: what the patient said they would like to
 * change, in the clinician's selection and the patient's own words. It lives
 * on the working case (saved on the device and synced with the case), never in
 * SmileSettings, so it is not part of any generation request, and editing it
 * never regenerates or alters a saved image.
 */

export const PATIENT_GOALS = ["Colour", "Shape / edges", "Alignment", "Gaps", "Missing teeth", "Other"] as const;
export type PatientGoal = typeof PATIENT_GOALS[number];
export const PATIENT_WORDS_LIMIT = 500;

export interface CaseConsultation {
  schemaVersion: 1;
  /** Explicitly selected; empty by default. */
  patientGoals: PatientGoal[];
  /** Optional, in the patient's words. */
  patientWords?: string;
  updatedAt: number;
}

// Synced case state refuses text that starts like a URL or embedded file; an
// invisible leading character keeps such patient wording saveable as text.
const URL_LIKE = /^(data:|blob:|https?:\/\/)/i;
const GUARD = "⁠";

function words(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/^⁠/, "").slice(0, PATIENT_WORDS_LIMIT);
  if (!text.trim()) return undefined;
  return URL_LIKE.test(text) ? GUARD + text : text;
}

/** Text for display, without the storage guard. */
export function displayWords(c: CaseConsultation | undefined): string {
  return c?.patientWords?.replace(/^⁠/, "") ?? "";
}

/** Saved or synced data in, a valid record (or nothing) out. Legacy cases have none. */
export function normaliseConsultation(value: unknown): CaseConsultation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Partial<CaseConsultation>;
  if (v.schemaVersion !== 1) return undefined;
  const goals = Array.isArray(v.patientGoals) ? PATIENT_GOALS.filter(g => v.patientGoals!.includes(g)) : [];
  const patientWords = words(v.patientWords);
  if (!goals.length && !patientWords) return undefined;
  return { schemaVersion: 1, patientGoals: goals, ...(patientWords ? { patientWords } : {}), updatedAt: Number.isFinite(v.updatedAt) ? v.updatedAt! : 0 };
}

/** A change from the goals card; clearing everything removes the record. */
export function updateConsultation(current: CaseConsultation | undefined, patch: { patientGoals?: PatientGoal[]; patientWords?: string }, now = Date.now()): CaseConsultation | undefined {
  return normaliseConsultation({
    schemaVersion: 1,
    patientGoals: patch.patientGoals ?? current?.patientGoals ?? [],
    patientWords: "patientWords" in patch ? patch.patientWords : current?.patientWords,
    updatedAt: now,
  });
}

/** "Colour · Gaps", for the quiet context row. Null when nothing is recorded. */
export function goalsSummary(c: CaseConsultation | undefined): string | null {
  if (!c) return null;
  if (c.patientGoals.length) return c.patientGoals.join(" · ");
  return displayWords(c) ? "Patient’s words recorded" : null;
}
