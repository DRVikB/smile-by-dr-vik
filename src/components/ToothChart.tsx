"use client";
import { useState } from "react";
import { DESIGN_INTENTS } from "@/lib/generation/designPlan";
import { activeToothPlans, lowerArch, toothSummary, updateToothPlan, upperArch } from "@/lib/teeth";
import type { SmileSettings, ToothPlan } from "@/lib/types";

export function ToothChart({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  const [focused, setFocused] = useState(11);
  const plans = settings.toothPlans ?? activeToothPlans(settings).map(p => ({ ...p, intent: "Auto" as const }));
  const current: ToothPlan = plans.find(p => p.tooth === focused) ?? { tooth: focused, intent: "Preserve", condition: "Natural" };
  const update = (patch: Partial<ToothPlan>) => onChange(updateToothPlan(settings, { ...current, ...patch }));
  return <details className="clinical-details">
    <summary>Individual teeth · {toothSummary(settings)}</summary>
    <p className="control-hint">Tap a tooth to set its instructions. FDI numbers: patient’s right to left. Unselected and missing teeth stay unchanged. Only visible, identifiable teeth can be illustrated.</p>
    {[upperArch, lowerArch].map((arch, i) => <div key={i} className="tooth-arch">
      <strong>{i ? "Lower" : "Upper"}</strong>
      <div className="tooth-grid" role="group" aria-label={`${i ? "Lower" : "Upper"} tooth chart`}>
        {arch.map(tooth => {
          const plan = plans.find(p => p.tooth === tooth);
          const active = settings.selectedTeeth.includes(tooth);
          return <button type="button" key={tooth} aria-label={`Tooth ${tooth}: ${plan?.condition === "Missing" ? "missing" : active ? "selected for editing" : "preserved"}`} aria-pressed={focused === tooth} className={`${active ? "active" : ""} ${focused === tooth ? "focused" : ""}`} onClick={() => setFocused(tooth)}>{tooth}<small>{plan?.condition === "Missing" ? "—" : active ? "Edit" : "Keep"}</small></button>;
        })}
      </div>
    </div>)}
    <div className="tooth-editor">
      <strong>Tooth {focused}</strong>
      <label>Condition<select className="design-select" value={current.condition} onChange={e => update({ condition: e.target.value as ToothPlan["condition"], ...(e.target.value === "Missing" ? { intent: "Preserve" as const } : {}) })}>{["Natural", "Restored", "Missing"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Action<select className="design-select" disabled={current.condition === "Missing"} value={current.intent} onChange={e => update({ intent: e.target.value as ToothPlan["intent"] })}>{["Preserve", ...DESIGN_INTENTS].map(v => <option value={v} key={v}>{v === "Auto" ? "Follow global goal" : v}</option>)}</select></label>
      {current.intent !== "Preserve" && current.condition !== "Missing" && <label>Shade<select className="design-select" value={current.targetShade ?? "Global"} onChange={e => update({ targetShade: e.target.value === "Global" ? undefined : e.target.value as ToothPlan["targetShade"] })}>{["Global", "The same", "Whiten", "Bleach"].map(v => <option key={v} value={v}>{v === "Global" ? "Follow global shade" : v}</option>)}</select></label>}
      {current.condition === "Restored" && <p className="control-hint">Existing restorations do not whiten like natural teeth. This colour preference needs clinical assessment.</p>}
    </div>
    <p className="control-hint">The 4 / 6 / 8 / 10 presets replace this individual plan with an upper-teeth selection. Recheck your painted edit area after changing the selection.</p>
  </details>;
}
