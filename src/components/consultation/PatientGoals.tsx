"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { PATIENT_GOALS, PATIENT_WORDS_LIMIT, displayWords, updateConsultation, type CaseConsultation, type PatientGoal } from "@/lib/caseConsultation";

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

/** The same editor, reopened from the design or result without restarting the case. */
export function PatientGoalsSheet({ consultation, onChange, onClose }: Props & { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet patient-goals-sheet" role="dialog" aria-modal="true" aria-labelledby="patient-goals-title">
        <h2 id="patient-goals-title">Patient goals</h2>
        <GoalsEditor consultation={consultation} onChange={onChange} idPrefix="sheet-goals" />
        <button type="button" className="primary-button" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
