"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import {
  CONSULTATION_NOTE_LIMIT, NEXT_STEP_OPTIONS, PATIENT_GOALS, PATIENT_WORDS_LIMIT, displayText, displayWords, updateConsultation,
  type CaseConsultation, type NextStep, type PatientGoal,
} from "@/lib/caseConsultation";

type Props = { consultation: CaseConsultation | undefined; onChange: (next: CaseConsultation | undefined) => void };

/** Goal chips and the patient's own words. Nothing is selected by default. */
function GoalsEditor({ consultation, onChange, idPrefix }: Props & { idPrefix: string }) {
  const goals = consultation?.patientGoals ?? [];
  const toggle = (goal: PatientGoal) =>
    onChange(updateConsultation(consultation, { patientGoals: goals.includes(goal) ? goals.filter(g => g !== goal) : [...goals, goal] }));
  return (
    <div className="patient-goals-editor">
      <p className="patient-goals-question" id={`${idPrefix}-question`}>What would they like to change?</p>
      <div className="patient-goals-chips" role="group" aria-labelledby={`${idPrefix}-question`}>
        {PATIENT_GOALS.map(goal => (
          <button key={goal} type="button" aria-pressed={goals.includes(goal)} onClick={() => toggle(goal)}>{goal}</button>
        ))}
      </div>
      <label className="patient-goals-words" htmlFor={`${idPrefix}-words`}>In their words <span>optional</span></label>
      <textarea
        id={`${idPrefix}-words`}
        rows={2}
        maxLength={PATIENT_WORDS_LIMIT}
        placeholder="“A little brighter, but I still want it to look like me.”"
        value={displayWords(consultation)}
        onChange={e => onChange(updateConsultation(consultation, { patientWords: e.target.value }))}
      />
      <p className="control-hint">Saved with this case for the consultation. Not sent to the image service, and changing it never alters a saved preview.</p>
    </div>
  );
}

/** Optional card beside the selected photo. Skipping it keeps the fast route to the design. */
export function PatientGoalsCard({ consultation, onChange }: Props) {
  const count = (consultation?.patientGoals.length ?? 0) + (displayWords(consultation) ? 1 : 0);
  // Open on arrival when something is already recorded; afterwards it is the clinician's to toggle.
  const [openInitially] = useState(count > 0);
  return (
    <details className="photo-tips-disclosure patient-goals" open={openInitially || undefined}>
      <summary>
        <span className="photo-row-icon" aria-hidden="true"><MessageSquareText size={17} strokeWidth={1.7} /></span>
        <span>Patient goals <small>{!count ? "Optional" : consultation!.patientGoals.length ? `${consultation!.patientGoals.length} selected` : "Their words noted"}</small></span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <GoalsEditor consultation={consultation} onChange={onChange} idPrefix="photo-goals" />
    </details>
  );
}

/** The agreed next step: chosen by the clinician, empty until then, never inferred from a preferred image. */
function NextStepEditor({ consultation, onChange }: Props) {
  const chosen = consultation?.nextStep;
  const choose = (step: NextStep) => onChange(updateConsultation(consultation, { nextStep: chosen === step ? undefined : step }));
  return (
    <div className="patient-goals-editor">
      <p className="patient-goals-question" id="next-step-question">What happens next?</p>
      <div className="patient-goals-chips" role="group" aria-labelledby="next-step-question">
        {NEXT_STEP_OPTIONS.map(step => <button key={step} type="button" aria-pressed={chosen === step} onClick={() => choose(step)}>{step}</button>)}
      </div>
      <label className="patient-goals-words" htmlFor="next-step-note">Note <span>optional</span></label>
      <input id="next-step-note" className="name-field" maxLength={CONSULTATION_NOTE_LIMIT} placeholder="e.g. Review in two weeks, after hygiene"
        value={displayText(consultation?.nextStepNote)} onChange={e => onChange(updateConsultation(consultation, { nextStepNote: e.target.value }))} />
      <p className="control-hint">Shown in the Consultation Report. Recording a next step doesn’t book anything.</p>
    </div>
  );
}

/** Why the patient preferred the version marked as their preferred direction. */
function PreferredReasonEditor({ consultation, onChange, hasPreferred }: Props & { hasPreferred: boolean }) {
  if (!hasPreferred) return <p className="control-hint patient-goals-editor">No version is marked as the patient’s preferred yet. On a result, choose Options › Patient prefers this version.</p>;
  return (
    <div className="patient-goals-editor">
      <label className="patient-goals-words" htmlFor="preferred-reason">Why this direction <span>optional</span></label>
      <input id="preferred-reason" className="name-field" maxLength={CONSULTATION_NOTE_LIMIT} placeholder="e.g. Brighter, but still natural"
        value={displayText(consultation?.preferredReason)} onChange={e => onChange(updateConsultation(consultation, { preferredReason: e.target.value }))} />
    </div>
  );
}

/**
 * The consultation, reopened from the design or result without restarting the
 * case: what the patient would like, why they preferred a direction, and what
 * happens next. None of it is sent with a generation.
 */
export function PatientGoalsSheet({ consultation, onChange, onClose, hasPreferred = false }: Props & { onClose: () => void; hasPreferred?: boolean }) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet patient-goals-sheet" role="dialog" aria-modal="true" aria-labelledby="patient-goals-title">
        <h2 id="patient-goals-title">Consultation</h2>
        <h3 className="patient-goals-section">Patient goals</h3>
        <GoalsEditor consultation={consultation} onChange={onChange} idPrefix="sheet-goals" />
        <h3 className="patient-goals-section">Preferred direction</h3>
        <PreferredReasonEditor consultation={consultation} onChange={onChange} hasPreferred={hasPreferred} />
        <h3 className="patient-goals-section">Next step</h3>
        <NextStepEditor consultation={consultation} onChange={onChange} />
        <button type="button" className="primary-button" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
