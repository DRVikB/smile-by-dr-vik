"use client";
import { useEffect, useState } from "react";
import { readLibraryMedia } from "@/lib/caseLibrary";
import { saveValidationRecord, validationMetrics } from "@/lib/validation";
import type { GenerationResult } from "@/lib/types";
export function ValidationPanel({ caseId, result, before }: { caseId: string; result: GenerationResult; before: string }) {
  const [actual, setActual] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [reviewer, setReviewer] = useState("Dr Vik");
  const [notes, setNotes] = useState("");
  const [scores, setScores] = useState<Record<string,number>>({});
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; readLibraryMedia(caseId).then(m => { if (active) setActual(m?.image ?? ""); }).catch(() => setMessage("The actual outcome could not be loaded.")); return () => { active = false; }; }, [caseId]);
  return <details className="review-panel" open><summary>Outcome validation · clinician only</summary>
    <p className="control-hint">This finished case is held out from references. These are your ratings, not proof of clinical accuracy. Compare photographic framing and lighting before scoring. Exact shade requires calibrated photographs.</p>
    <div className="validation-images">
      <figure><img src={before} alt="Validation before photograph" /><figcaption>Before</figcaption></figure>
      <figure><img src={result.image} alt="Validation AI illustration" /><figcaption>AI illustration</figcaption></figure>
      <figure>{revealed && actual ? <img src={actual} alt="Actual completed treatment outcome" /> : <button className="secondary-button" disabled={!actual} onClick={() => setRevealed(true)}>Reveal actual outcome</button>}<figcaption>Actual result</figcaption></figure>
    </div>
    {result.mode === "mock" || result.preferences?.testMode ? <p className="control-hint">Demo results cannot be scored as validation.</p> : <form className="clinical-form" onSubmit={async e => {
      e.preventDefault(); if (!result.preferences) return;
      try { await saveValidationRecord({ id: `${caseId}:${result.variationId}`, caseId, variationId: result.variationId, createdAt: Date.now(), reviewer: reviewer.trim(), notes, scores: scores as Record<typeof validationMetrics[number],number>, settings: result.preferences.settings, estimatedUsd: result.cost?.usd, elapsedSeconds: result.elapsedSeconds }); setMessage("Validation scores saved on this device. Export them from Case library."); } catch { setMessage("Choose all four ratings and enter the reviewer’s name."); }
    }}>
      <label>Reviewer<input className="name-field" required maxLength={80} value={reviewer} onChange={e => setReviewer(e.target.value)} /></label>
      {validationMetrics.map(metric => <label key={metric}>{metric}<select className="design-select" required disabled={!revealed} value={scores[metric] ?? ""} onChange={e => setScores({ ...scores, [metric]: Number(e.target.value) })}><option value="">Choose rating</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} · {n === 1 ? "Poor match" : n === 5 ? "Close match" : ""}</option>)}</select></label>)}
      <label>Differences / limitations<textarea className="notes-field" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <button className="secondary-button" disabled={!revealed}>Save validation scores</button>
    </form>}
    {message && <p role="status" className="control-hint">{message}</p>}
  </details>;
}
