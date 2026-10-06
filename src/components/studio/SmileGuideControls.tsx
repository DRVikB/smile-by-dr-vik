"use client";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import { normaliseGuide, type SmileGuide } from "@/lib/smileDesign/frame";

export interface SmileGuideState {
  value: SmileGuide | null;
  status: "fitting" | "ready" | "unavailable";
  onChange: (guide: SmileGuide) => void;
}

const SLIDERS = [
  { key: "width", label: "Width", min: 0.7, max: 1.3, low: "Narrower", high: "Wider" },
  { key: "length", label: "Tooth length", min: 0.7, max: 1.35, low: "Shorter", high: "Longer" },
  { key: "curve", label: "Smile curve", min: 0, max: 1.8, low: "Flatter", high: "Deeper" },
] as const;
const NUDGE = 0.01;

/** Show, adjust and reset the smile guide drawn on the photo (Shape step). */
export function SmileGuideControls({ guide }: { guide: SmileGuideState }) {
  const g = guide.value;
  const set = (patch: Partial<SmileGuide>) => { if (g) { const next = normaliseGuide({ ...g, ...patch }); if (next) guide.onChange(next); } };
  const adjusted = g && (g.width !== 1 || g.length !== 1 || g.curve !== 1 || g.dx !== 0 || g.dy !== 0);
  return (
    <div className="control-group smile-guide-controls">
      <label className="studio-switch-row">
        <span className="studio-treatment-text">
          <strong>Smile guide</strong>
          <small>{guide.status === "unavailable" ? "The smile couldn’t be found in this photo" : guide.status === "fitting" ? "Fitting to this smile…" : "Gum line, edge curve, midline and front teeth"}</small>
        </span>
        <input type="checkbox" role="switch" className="studio-switch" disabled={!g} checked={Boolean(g?.visible)} onChange={e => set({ visible: e.target.checked })} />
      </label>
      {g?.visible && <>
        {SLIDERS.map(s => {
          const value = g[s.key];
          const pct = ((value - s.min) / (s.max - s.min)) * 100;
          return (
            <div key={s.key} className="smile-guide-slider">
              <div className="control-label"><label htmlFor={`guide-${s.key}`}>{s.label}</label><span className="muted">{Math.round(value * 100)}%</span></div>
              <input className="intensity-slider" id={`guide-${s.key}`} type="range" min={s.min} max={s.max} step={0.01} value={value}
                aria-valuetext={`${Math.round(value * 100)} percent of the fitted ${s.label.toLowerCase()}`} style={{ "--range": `${pct}%` } as React.CSSProperties}
                onChange={e => set({ [s.key]: Number(e.target.value) })} />
              <div className="range-labels"><span>{s.low}</span><span>{s.high}</span></div>
            </div>
          );
        })}
        <div className="smile-guide-nudge" role="group" aria-label="Move the smile guide">
          <button type="button" className="icon-button" aria-label="Move left" onClick={() => set({ dx: g.dx - NUDGE })}><ArrowLeft size={18} /></button>
          <button type="button" className="icon-button" aria-label="Move up" onClick={() => set({ dy: g.dy - NUDGE })}><ArrowUp size={18} /></button>
          <button type="button" className="icon-button" aria-label="Move down" onClick={() => set({ dy: g.dy + NUDGE })}><ArrowDown size={18} /></button>
          <button type="button" className="icon-button" aria-label="Move right" onClick={() => set({ dx: g.dx + NUDGE })}><ArrowRight size={18} /></button>
          <button type="button" className="text-button smile-guide-reset" disabled={!adjusted} onClick={() => set({ width: 1, length: 1, curve: 1, dx: 0, dy: 0 })}>
            <RotateCcw size={15} aria-hidden="true" />Reset
          </button>
        </div>
        <p className="control-hint">{g.shape.measured
          ? "Fitted to this patient’s teeth: the dental midline, each tooth’s width, the gum line and the biting edges. "
          : "The teeth couldn’t be measured clearly, so the guide is placed from the lips. Adjust it to the teeth. "}
          The outlines use the tooth form chosen above.{g.nasal ? " The dashed lines mark the width of the nose, a common reference for the canines." : ""} Drag the dot below the midline to move the guide. A planning guide for you and the patient; the visualisation doesn’t use it.</p>
      </>}
    </div>
  );
}
