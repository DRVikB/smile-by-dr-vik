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

/** What happens next, chosen by the clinician. Nothing is chosen by default or inferred from a preferred image. */
export const NEXT_STEP_OPTIONS = ["Further assessment", "Records / scan", "Review appointment", "Considering options", "No further treatment planned", "Other"] as const;
export type NextStep = typeof NEXT_STEP_OPTIONS[number];
export const CONSULTATION_NOTE_LIMIT = 200;

export interface CaseConsultation {
  schemaVersion: 1;
  /** Explicitly selected; empty by default. */
  patientGoals: PatientGoal[];
  /** Optional, in the patient's words. */
  patientWords?: string;
  /** Why the patient preferred the version marked as their preferred direction. */
  preferredReason?: string;
  /** The agreed next step, chosen by the clinician. */
  nextStep?: NextStep;
  /** A short clinician note on the next step ("Review in 2 weeks after hygiene"). */
  nextStepNote?: string;
  updatedAt: number;
}

// Synced case state refuses text that starts like a URL or embedded file; an
// invisible leading character keeps such patient wording saveable as text.
const URL_LIKE = /^(data:|blob:|https?:\/\/)/i;
const GUARD = "⁠";

function words(value: unknown, limit = PATIENT_WORDS_LIMIT): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/^⁠/, "").slice(0, limit);
  if (!text.trim()) return undefined;
  return URL_LIKE.test(text) ? GUARD + text : text;
}

/** Text for display, without the storage guard. */
export function displayWords(c: CaseConsultation | undefined): string {
  return c?.patientWords?.replace(/^⁠/, "") ?? "";
}

/** Any stored note for display, without the storage guard. */
export function displayText(value: string | undefined): string {
  return value?.replace(/^⁠/, "") ?? "";
}

/** Saved or synced data in, a valid record (or nothing) out. Legacy cases have none. */
export function normaliseConsultation(value: unknown): CaseConsultation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Partial<CaseConsultation>;
  if (v.schemaVersion !== 1) return undefined;
  const goals = Array.isArray(v.patientGoals) ? PATIENT_GOALS.filter(g => v.patientGoals!.includes(g)) : [];
  const patientWords = words(v.patientWords);
  const preferredReason = words(v.preferredReason, CONSULTATION_NOTE_LIMIT);
  const nextStep = NEXT_STEP_OPTIONS.find(o => o === v.nextStep);
  const nextStepNote = words(v.nextStepNote, CONSULTATION_NOTE_LIMIT);
  if (!goals.length && !patientWords && !preferredReason && !nextStep && !nextStepNote) return undefined;
  return {
    schemaVersion: 1, patientGoals: goals,
    ...(patientWords ? { patientWords } : {}),
    ...(preferredReason ? { preferredReason } : {}),
    ...(nextStep ? { nextStep } : {}),
    ...(nextStepNote ? { nextStepNote } : {}),
    updatedAt: Number.isFinite(v.updatedAt) ? v.updatedAt! : 0,
  };
}

/** A change from the goals card; clearing everything removes the record. */
export type ConsultationPatch = Partial<Pick<CaseConsultation, "patientGoals" | "patientWords" | "preferredReason" | "nextStep" | "nextStepNote">>;

export function updateConsultation(current: CaseConsultation | undefined, patch: ConsultationPatch, now = Date.now()): CaseConsultation | undefined {
  const pick = <K extends keyof ConsultationPatch>(key: K) => (key in patch ? patch[key] : current?.[key]);
  return normaliseConsultation({
    schemaVersion: 1,
    patientGoals: patch.patientGoals ?? current?.patientGoals ?? [],
    patientWords: pick("patientWords"),
    preferredReason: pick("preferredReason"),
    nextStep: pick("nextStep"),
    nextStepNote: pick("nextStepNote"),
    updatedAt: now,
  });
}

/**
 * Older cases kept the patient's priorities in the design's clinical data
 * (`clinicalData.patientPriorities`), which travelled with each generation
 * request. Patient goals are now the one home for them: the text moves into
 * the patient's words (unless words are already recorded) and leaves the design.
 */
export function adoptLegacyPriorities<S extends { clinicalData?: { patientPriorities?: string } }>(
  consultation: CaseConsultation | undefined, settings: S, now = Date.now(),
): { consultation: CaseConsultation | undefined; settings: S } {
  const legacy = settings.clinicalData?.patientPriorities?.trim();
  if (settings.clinicalData?.patientPriorities === undefined) return { consultation, settings };
  const { patientPriorities: _moved, ...clinicalData } = settings.clinicalData;
  void _moved;
  const next = legacy && !displayWords(consultation) ? updateConsultation(consultation, { patientWords: legacy }, now) : consultation;
  return { consultation: next, settings: { ...settings, clinicalData } };
}

/** "Colour · Gaps", for the quiet context row. Null when nothing is recorded. */
export function goalsSummary(c: CaseConsultation | undefined): string | null {
  if (!c) return null;
  if (c.patientGoals.length) return c.patientGoals.join(" · ");
  if (displayWords(c)) return "Patient’s words recorded";
  return c.nextStep ? `Next step: ${c.nextStep}` : null;
}
