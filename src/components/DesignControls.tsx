"use client";
import { Check, ImagePlus, Layers, Sparkles, X } from "lucide-react";
import type {
  CurrentShade,
  Photo,
  ShotType,
  SmileSettings,
  TargetShade,
  TeethCount,
  TextureLevel,
  ToothShape,
  Treatment,
} from "@/lib/types";
import { upperTeeth } from "@/lib/types";

const SHADE_COLOURS: Record<string, string> = {
  A3: "#d9c9aa",
  A2: "#e6d9bd",
  A1: "#eee3cb",
  B1: "#f1ecdb",
  BL3: "#f4f0e4",
  BL2: "#f8f6ed",
  BL1: "#fdfcf8",
};

const SHAPES: { name: string; shape: ToothShape; image: string; description: string }[] = [
  { name: "Square", shape: "Square", image: "square", description: "Structured, balanced tooth form" },
  { name: "Triangle", shape: "Triangular", image: "triangle", description: "Tapered, delicate tooth form" },
  { name: "Round", shape: "Rounded", image: "round", description: "Soft, rounded tooth form" },
];

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

function ShadeRow<T extends string>({
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
    <>
      <span className="shade-side-label">{label}</span>
      <div className="shade-row" role="group" aria-label={`${label} shade`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="shade-option"
            aria-pressed={value === option}
            aria-label={`${label} shade ${option}`}
            onClick={() => onChange(option)}
          >
            <span
              className="shade-swatch"
              style={{ background: SHADE_COLOURS[option] }}
            >
              {value === option && <Check size={12} strokeWidth={2.4} />}
            </span>
            <span>{option}</span>
          </button>
        ))}
      </div>
    </>
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
        {(["Square", "Rounded", "Triangular"] as const).map((shape) => (
          <button
            key={shape}
            type="button"
            onClick={() => onChange(shape)}
            className={`shape-option ${value === shape ? "selected" : ""}`}
            aria-pressed={value === shape}
          >
            <svg aria-hidden="true" width="27" height="32" viewBox="0 0 36 42">
              <path
                d={
                  shape === "Square"
                    ? "M8 5 Q18 3 28 5 L28 34 Q28 37 25 37 L11 37 Q8 37 8 34 Z"
                    : shape === "Rounded"
                      ? "M8 5 Q18 2 28 5 L29 24 Q29 37 18 37 Q7 37 7 24 Z"
                      : "M12 5 Q18 3 24 5 L29 35 Q29 37 27 37 L9 37 Q7 37 7 35 Z"
                }
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            <span>{shape}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DesignControls({
  settings,
  onChange,
  onGenerate,
  onCompare,
  busy,
  reference,
  onAddReference,
  onClearReference,
}: {
  settings: SmileSettings;
  onChange: (s: SmileSettings) => void;
  onGenerate: () => void;
  onCompare: () => void;
  busy: boolean;
  reference: Photo | null;
  onAddReference: () => void;
  onClearReference: () => void;
}) {
  function change<K extends keyof SmileSettings>(
    key: K,
    value: SmileSettings[K],
  ) {
    onChange({ ...settings, [key]: value });
  }
  return (
    <aside className="design-panel">
      <h2 className="design-panel-title">Smile design</h2>
      <fieldset disabled={busy} className="design-fieldset" aria-label="Smile design controls">
            <SegmentedControl<TeethCount>
              label="Teeth"
              options={[4, 6, 8, 10]}
              value={settings.teeth}
              onChange={(teeth) =>
                onChange({
                  ...settings,
                  teeth,
                  selectedTeeth: upperTeeth[teeth],
                })
              }
            />
            <div className="control-group">
              <div className="control-label">Shade</div>
              <div className="shade-group">
                <ShadeRow<CurrentShade>
                  label="Current"
                  options={["A3", "A2", "A1", "B1"]}
                  value={settings.currentShade}
                  onChange={(v) => change("currentShade", v)}
                />
                <ShadeRow<TargetShade>
                  label="Target"
                  options={["A1", "B1", "BL3", "BL2", "BL1"]}
                  value={settings.targetShade}
                  onChange={(v) => change("targetShade", v)}
                />
              </div>
            </div>

            <div className="control-group">
              <div className="control-label">Tooth shape</div>
              <div className="tooth-card-row" role="group" aria-label="Tooth shape">
                {SHAPES.map((s) => (
                  <button key={s.shape} type="button" className="tooth-card"
                    aria-pressed={settings.shape === s.shape}
                    onClick={() => change("shape", s.shape)}>
                    <span className="tooth-card-photo">
                      <img src={`/tooth-shape-${s.image}.png`} alt={`${s.name} tooth form example`} />
                      {settings.shape === s.shape && <span className="tooth-card-check"><Check size={12} /></span>}
                    </span>
                    <span className="tooth-card-title">{s.name}</span>
                    <span className="tooth-card-description">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <SegmentedControl<Treatment>
              label="Treatment"
              options={["Composite", "Porcelain"]}
              value={settings.treatment}
              onChange={(v) => change("treatment", v)}
            />

            <div className="control-group">
              <div className="control-label">
                <label htmlFor="intensity">Result intensity</label>
              </div>
              <input
                className="intensity-slider"
                id="intensity"
                type="range"
                min={0}
                max={100}
                value={settings.intensity}
                aria-valuetext={`${settings.intensity} percent enhanced`}
                style={
                  { "--range": `${settings.intensity}%` } as React.CSSProperties
                }
                onChange={(e) => change("intensity", Number(e.target.value))}
              />
              <div className="range-labels">
                <span>Subtle</span>
                <span>Enhanced</span>
              </div>
            </div>
            <SegmentedControl<TextureLevel>
              label="Texture"
              options={["Smooth", "Natural", "Textured"]}
              value={settings.texture}
              onChange={(v) => change("texture", v)}
            />
            <SegmentedControl<ShotType>
              label="Photo type"
              options={["Full face", "Close-up"]}
              value={settings.shotType}
              onChange={(v) => change("shotType", v)}
            />
            <div className="control-group">
              <div className="control-label">
                <label htmlFor="notes">Notes</label>
                <span className="muted">Optional</span>
              </div>
              <textarea
                id="notes"
                className="notes-field"
                rows={2}
                maxLength={400}
                placeholder="e.g. close the black triangles, lengthen the laterals slightly"
                value={settings.notes}
                onChange={(e) => change("notes", e.target.value)}
              />
            </div>
            <div className="control-group">
              <div className="control-label">
                <span>Reference photo</span>
                <span className="muted">Optional</span>
              </div>
              {reference ? (
                <div className="reference-preview">
                  <img src={reference.dataUrl} alt="Reference smile" />
                  <div className="reference-meta">
                    <span>Guides shape &amp; shade</span>
                    <button type="button" onClick={onClearReference}>
                      <X size={13} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="reference-add"
                  onClick={onAddReference}
                >
                  <ImagePlus size={17} strokeWidth={1.6} />
                  Add a smile they like
                </button>
              )}
            </div>
            <button
              type="button"
              className="secondary-button compare-button"
              onClick={onCompare}
            >
              <Layers size={16} strokeWidth={1.6} />
              Compare 3 shapes
            </button>
      </fieldset>

      <div className="panel-actions">
        <button
          className="primary-button generate-button"
          onClick={onGenerate}
          disabled={busy}
        >
          <Sparkles size={17} strokeWidth={1.5} />
          {busy ? "Creating your preview…" : "Create Preview"}
        </button>
      </div>
    </aside>
  );
}
