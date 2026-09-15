"use client";
import { Check, Sparkles } from "lucide-react";
import type {
  CurrentShade,
  SmileSettings,
  TargetShade,
  TeethCount,
  ToothShape,
  Treatment,
} from "@/lib/types";
import { upperTeeth } from "@/lib/types";
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="control-group">
      <div className="control-label">{label}</div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            className={value === option ? "selected" : ""}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
const shadeColors: Record<string, string> = {
  A3: "#d9c9aa",
  A2: "#e6d9bd",
  A1: "#eee3cb",
  B1: "#f1ecdb",
  BL3: "#f4f0e4",
  BL2: "#f8f6ed",
  BL1: "#fdfcf8",
};
export function ShadeSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="control-group">
      <div className="control-label">
        {label}
        <span>{value}</span>
      </div>
      <div className="shade-row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            className={`shade-option ${value === option ? "selected" : ""}`}
            aria-pressed={value === option}
            aria-label={`${label} ${option}`}
            onClick={() => onChange(option)}
          >
            <span
              className="shade-swatch"
              style={{ background: shadeColors[option] }}
            >
              {value === option && <Check size={13} strokeWidth={1.8} />}
            </span>
            <span>{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function ShapeSelector({
  value,
  onChange,
}: {
  value: ToothShape;
  onChange: (v: ToothShape) => void;
}) {
  return (
    <div className="control-group">
      <div className="control-label">Tooth shape</div>
      <div className="shape-row" role="group" aria-label="Tooth shape">
        {(["Rounded", "Soft Square", "Square"] as const).map((shape) => (
          <button
            key={shape}
            onClick={() => onChange(shape)}
            className={`shape-option ${value === shape ? "selected" : ""}`}
            aria-pressed={value === shape}
          >
            <svg aria-hidden="true" width="33" height="39" viewBox="0 0 36 42">
              <path
                d={
                  shape === "Rounded"
                    ? "M8 5 Q18 2 28 5 L29 24 Q29 37 18 37 Q7 37 7 24 Z"
                    : shape === "Soft Square"
                      ? "M7 5 Q18 2 29 5 L28 31 Q28 37 23 37 L13 37 Q8 37 8 31 Z"
                      : "M7 5 Q18 3 29 5 L28 35 Q28 37 26 37 L10 37 Q8 37 8 35 Z"
                }
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
            <span>{shape}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function ResultIntensitySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="control-group result-group">
      <div className="control-label">
        <label htmlFor="intensity">Result</label>
        <span>{value}%</span>
      </div>
      <input
        className="intensity-slider"
        id="intensity"
        type="range"
        min={0}
        max={100}
        value={value}
        aria-valuetext={`${value} percent enhanced`}
        style={{ "--range": `${value}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="range-labels">
        <span>Natural</span>
        <span>Enhanced</span>
      </div>
    </div>
  );
}
export function GenerateButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="primary-button generate-button"
      onClick={onClick}
      disabled={disabled}
    >
      <Sparkles size={17} strokeWidth={1.5} />
      {disabled ? "Creating your preview…" : "Generate Smile"}
    </button>
  );
}
export function DesignControls({
  settings,
  onChange,
  onGenerate,
  busy,
}: {
  settings: SmileSettings;
  onChange: (s: SmileSettings) => void;
  onGenerate: () => void;
  busy: boolean;
}) {
  function change<K extends keyof SmileSettings>(
    key: K,
    value: SmileSettings[K],
  ) {
    onChange({ ...settings, [key]: value });
  }
  return (
    <aside className="design-panel">
      <div className="panel-heading">
        <span>Your smile, considered.</span>
        <span>01—06</span>
      </div>
      <fieldset disabled={busy} className="design-fieldset">
        <SegmentedControl<TeethCount>
          label="Teeth"
          options={[4, 6, 8, 10]}
          value={settings.teeth}
          onChange={(teeth) =>
            onChange({ ...settings, teeth, selectedTeeth: upperTeeth[teeth] })
          }
        />
        <SegmentedControl<Treatment>
          label="Treatment"
          options={["Composite", "Porcelain"]}
          value={settings.treatment}
          onChange={(v) => change("treatment", v)}
        />
        <ShadeSelector<CurrentShade>
          label="Current shade"
          options={["A3", "A2", "A1", "B1"]}
          value={settings.currentShade}
          onChange={(v) => change("currentShade", v)}
        />
        <ShadeSelector<TargetShade>
          label="Target shade"
          options={["A1", "B1", "BL3", "BL2", "BL1"]}
          value={settings.targetShade}
          onChange={(v) => change("targetShade", v)}
        />
        <ShapeSelector
          value={settings.shape}
          onChange={(v) => change("shape", v)}
        />
        <ResultIntensitySlider
          value={settings.intensity}
          onChange={(v) => change("intensity", v)}
        />
      </fieldset>
      <GenerateButton onClick={onGenerate} disabled={busy} />
      <p className="panel-footnote">A possibility to explore, together.</p>
    </aside>
  );
}
