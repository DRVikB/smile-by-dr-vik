"use client";
import { caseFeatures, type CaseFeature } from "@/lib/types";
export function CaseFeatures({ value, onChange }: { value: CaseFeature[]; onChange: (v: CaseFeature[]) => void }) {
  return <div className="feature-tags" role="group" aria-label="Starting conditions">{caseFeatures.map(feature => <button type="button" key={feature} className={value.includes(feature) ? "selected" : ""} aria-pressed={value.includes(feature)} onClick={() => onChange(value.includes(feature) ? value.filter(v => v !== feature) : [...value, feature])}>{feature}</button>)}</div>;
}
