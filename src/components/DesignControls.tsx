"use client";
import { Check, ImagePlus, Layers, Sparkles, X } from "lucide-react";
import type {
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

const SHAPES: { name: string; shape: ToothShape; description: string }[] = [
  { name: "Square", shape: "Square", description: "Straight sides, flat edge" },
  { name: "Triangle", shape: "Triangular", description: "Tapered towards the gum" },
  { name: "Round", shape: "Rounded", description: "Curved sides, soft edge" },
];

/** One tooth, drawn around x=0 so it can be placed and mirrored freely. */
const TOOTH_PATHS: Record<ToothShape, string> = {
  Square: "M-15 3 Q0 0 15 3 L15 55 Q15 60 10 60 L-10 60 Q-15 60 -15 55 Z",
  Rounded: "M-14 3 Q0 -1 14 3 L16 32 Q16 60 0 60 Q-16 60 -16 32 Z",
  Triangular: "M-9 2 Q0 -1 9 2 L16 54 Q16 60 12 60 L-12 60 Q-16 60 -16 54 Z",
};

/** Two central incisors with their neighbours, so the tooth form reads at a glance. */
function ToothForm({ shape }: { shape: ToothShape }) {
  const d = TOOTH_PATHS[shape];
  return (
    <svg className="tooth-form" viewBox="0 0 120 76" aria-hidden="true">
      <g className="tooth-form-side">
        <path d={d} transform="translate(16 13) scale(0.8 0.85)" />
        <path d={d} transform="translate(104 13) scale(0.8 0.85)" />
      </g>
      <g className="tooth-form-main">
        <path d={d} transform="translate(43 8)" />
        <path d={d} transform="translate(77 8)" />
      </g>
    </svg>
  );
}

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
            <SegmentedControl<TargetShade>
              label="Shade"
              options={["The same", "Whiten", "Bleach"]}
              value={["The same", "Whiten", "Bleach"].includes(settings.targetShade)
                ? settings.targetShade : settings.targetShade.startsWith("BL") ? "Bleach" : "Whiten"}
              onChange={(v) => change("targetShade", v)}
            />

            <div className="control-group">
              <div className="control-label">Tooth shape</div>
              <div className="tooth-card-row" role="group" aria-label="Tooth shape">
                {SHAPES.map((s) => (
                  <button key={s.shape} type="button" className="tooth-card"
                    aria-pressed={settings.shape === s.shape}
                    onClick={() => change("shape", s.shape)}>
                    <span className="tooth-card-figure">
                      <ToothForm shape={s.shape} />
                      {settings.shape === s.shape && (
                        <span className="tooth-card-check">
                          <Check size={13} strokeWidth={2.6} />
                        </span>
                      )}
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
