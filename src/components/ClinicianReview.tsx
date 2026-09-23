"use client";
import { useState } from "react";
import type { GenerationResult, ClinicianReview as Review } from "@/lib/types";
export function ClinicianReview({ result, onReview }: { result: GenerationResult; onReview: (review?: Review) => void }) {
  const [name, setName] = useState(result.review?.reviewer ?? "Dr Vik");
  const [notes, setNotes] = useState(result.review?.notes ?? "");
  const [checks, setChecks] = useState<string[]>([]);
  const labels = ["Gums, lips and untreated teeth compared with original", "Selected tooth contours and shade reviewed", "Limitations and assessment needs discussed"];
  const reviewed = result.review;
  return <details className="review-panel"><summary>{reviewed ? `Reviewed by ${reviewed.reviewer}` : "Review this illustration"}</summary>
    {reviewed ? <><p className="control-hint">Reviewed {new Date(reviewed.reviewedAt).toLocaleString()}. This records clinician review, not a guaranteed treatment outcome.</p><p className="control-hint">{reviewed.notes}</p><button className="text-button" onClick={() => { setChecks([]); onReview(); }}>Reopen review</button></> : <form className="clinical-form" onSubmit={e => { e.preventDefault(); if (checks.length === labels.length && name.trim()) onReview({ reviewer: name.trim(), notes: notes.trim(), reviewedAt: Date.now() }); }}>
      <label>Reviewer<input className="name-field" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      {labels.map(label => <label className="style-toggle" key={label}><input type="checkbox" checked={checks.includes(label)} onChange={e => setChecks(e.target.checked ? [...checks, label] : checks.filter(v => v !== label))} />{label}</label>)}
      <label>What changes / what stays / needs assessment<textarea className="notes-field" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="secondary-button" disabled={checks.length !== labels.length || !name.trim()}>Mark reviewed</button>
      <p className="control-hint">Applies only to this generated version. Your review notes appear on saved comparison reports. A new generation starts unreviewed.</p>
    </form>}
  </details>;
}
