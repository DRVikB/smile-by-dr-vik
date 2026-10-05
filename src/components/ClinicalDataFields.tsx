"use client";
import { useId } from "react";
import type { SmileSettings } from "@/lib/types";

export function ClinicalDataFields({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  const data = settings.clinicalData ?? {};
  const id = useId();
  function update(patch: Partial<NonNullable<SmileSettings["clinicalData"]>>) {
    onChange({ ...settings, clinicalData: { ...data, ...patch } });
  }
  return <div className="control-group clinical-data-fields">
    <div className="control-label">Additional clinical data · optional</div>
    <p className="control-hint">Enter measurements from your assessment, not estimates from this photo. Blank means unknown. Negative values may record an open bite or reverse overjet.</p>
    {([ ["overbiteMm", "overbite"], ["overjetMm", "overjet"] ] as const).map(([key, label]) => {
      const value = data[key];
      return <div className="clinical-measurement" key={key}>
        <label htmlFor={`${id}-${key}`}>Measured {label} (mm)</label>
        <div className="clinical-measurement-input">
          <input id={`${id}-${key}`} className="name-field" type="number" min={-20} max={20} step="0.1" inputMode="decimal" value={value ?? ""} onChange={e => update({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })} />
          <button type="button" className="clinical-sign-toggle" disabled={value === undefined || !Number.isFinite(value) || value === 0}
            aria-label={`Make ${label} ${value !== undefined && value < 0 ? "positive" : "negative"}`}
            title="Switch positive / negative"
            onClick={() => { if (value !== undefined && Number.isFinite(value) && value !== 0) update({ [key]: -value }); }}>
            <span aria-hidden="true">±</span>
          </button>
        </div>
      </div>;
    })}
    <label>Restorative space<select className="design-select" value={data.restorativeSpace ?? "Not assessed"} onChange={e => update({ restorativeSpace: e.target.value as typeof data.restorativeSpace })}>
      <option>Not assessed</option><option>Limited / uncertain</option><option>Assessed for planned changes</option>
    </select></label>
    <label>Visual constraints<textarea className="notes-field" rows={3} maxLength={1000} value={data.constraints ?? ""} placeholder="e.g. preserve upper incisal edges; no posterior additions" onChange={e => update({ constraints: e.target.value })} /></label>
    <p className="control-hint">Measurements are kept with the case; they do not direct image generation. Use the design controls for the intended appearance, and Patient goals for what the patient would like. Visual constraints and a limited-space restriction can guide the concept, without validating movement, clearance or an achievable outcome. Visual constraints are sent with the photo for AI processing: don’t include identifying details.</p>
  </div>;
}
