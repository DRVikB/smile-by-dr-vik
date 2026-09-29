"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import type { AlignmentArches, CurrentShade, FaceShape, Photo, ShotType, SmileCharacter, SmileSettings, TargetShade, TeethCount, TextureLevel, Treatment } from "@/lib/types";
import { upperTeeth, smileArcs, biteContexts } from "@/lib/types";
import { DESIGN_INTENTS, isNoChangeDesign, resolveDesignPlan } from "@/lib/generation/designPlan";
import { canGuideSmileArc } from "@/lib/smilePrinciples";
import { toothSummary } from "@/lib/teeth";
import { GenerationCosts, allowanceLabel, type GenerationCostsProps } from "@/components/GenerationCosts";
import { SegmentedControl, SHAPES, ToothForm } from "./StudioParts";
import { ToothChart } from "@/components/ToothChart";
import { ClinicalDataFields } from "@/components/ClinicalDataFields";
import { YourStyle } from "@/components/caseLibrary/YourStyle";
import { CompareSymbol, ComposeSymbol, ShadeSymbol, ToothSymbol, TreatmentSymbol, VisualiseSymbol, type SmileIcon } from "@/components/icons/SmileIcons";

/**
 * The Design Studio: the patient photograph in a frame, and the design built
 * one step at a time — Teeth, Shape, Shade, Treatment, then Review. Each step
 * is its own page led by its main choice, with clinical detail under "More
 * options". Back and Next move through the steps; the tabs jump to any step;
 * Review summarises the design and holds Generate.
 */
type StudioTab = "teeth" | "shape" | "shade" | "treatment" | "review";
/** Scope → form → colour → finish, then review: each step narrows the next. */
const TABS: { id: StudioTab; label: string; Icon: SmileIcon }[] = [
  { id: "teeth", label: "Teeth", Icon: ToothSymbol },
  { id: "shape", label: "Shape", Icon: ComposeSymbol },
  { id: "shade", label: "Shade", Icon: ShadeSymbol },
  { id: "treatment", label: "Treatment", Icon: TreatmentSymbol },
  { id: "review", label: "Review", Icon: VisualiseSymbol },
];

/** Upper teeth, patient's right to left, with a size for the arch drawing. */
const ARCH: { tooth: number; w: number; h: number }[] = [
  { tooth: 15, w: 20, h: 30 }, { tooth: 14, w: 21, h: 32 }, { tooth: 13, w: 22, h: 38 }, { tooth: 12, w: 22, h: 36 }, { tooth: 11, w: 28, h: 44 },
  { tooth: 21, w: 28, h: 44 }, { tooth: 22, w: 22, h: 36 }, { tooth: 23, w: 22, h: 38 }, { tooth: 24, w: 21, h: 32 }, { tooth: 25, w: 20, h: 30 },
];
const TEETH_COUNTS: TeethCount[] = [4, 6, 8, 10];

/** Target shades the design can aim for, lightest last. Swatch colours are indicative only. */
const SHADES: { value: TargetShade; label: string; swatch: string; description: string }[] = [
  { value: "A1", label: "A1", swatch: "#F1E4C8", description: "A light, warm natural shade." },
  { value: "B1", label: "B1", swatch: "#F5EDDB", description: "The lightest natural shade: bright and clean." },
  { value: "BL3", label: "BL3", swatch: "#F7F2E7", description: "Bleached: brighter than natural teeth." },
  { value: "BL2", label: "BL2", swatch: "#FAF7F0", description: "Bleached: very bright." },
  { value: "BL1", label: "BL1", swatch: "#FDFCF8", description: "Bleached: the brightest shade." },
];
const QUICK_SHADES: { value: TargetShade; label: string; description: string }[] = [
  { value: "The same", label: "Keep", description: "Keeps the patient’s current shade." },
  { value: "Whiten", label: "Whiten", description: "Brighter but natural; the shade is chosen to suit the smile." },
  { value: "Bleach", label: "Bleach", description: "The brightest result that still looks natural." },
];
const CURRENT_SHADES: CurrentShade[] = ["A3", "A2", "A1", "B1"];
const ALIGNMENT_ARCHES: { value: AlignmentArches; label: string }[] = [
  { value: "Upper", label: "Upper" },
  { value: "Lower", label: "Lower" },
  { value: "Both", label: "Both" },
];

const TREATMENTS: { value: Treatment; title: string; detail: string }[] = [
  { value: "Single-shade composite", title: "Composite bonding", detail: "Single shade · additive, conservative" },
  { value: "Layered composite", title: "Layered composite", detail: "Natural translucency and depth" },
  { value: "Porcelain", title: "Porcelain veneers", detail: "Uniform, high-lustre finish" },
];

function shadeDescription(value: TargetShade) {
  return SHADES.find(s => s.value === value)?.description ?? QUICK_SHADES.find(s => s.value === value)?.description ?? "";
}

function More({ children, label = "More options" }: { children: React.ReactNode; label?: string }) {
  return <details className="studio-more">
    <summary>{label}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="studio-more-body">{children}</div>
  </details>;
}

export function DesignStudio({
  stage, caseBar, costs, onEditArea, hasEditArea, settings, onChange, onGenerate, onCompare, onCompareMaterials, onHarmonise,
  busy, reference, onAddReference, onClearReference,
}: {
  /** The photograph (or before/after) shown in the studio frame. */
  stage: React.ReactNode;
  /** Case reference, photo actions and notices, shown on the Review step. */
  caseBar: React.ReactNode;
  costs: GenerationCostsProps;
  onEditArea: () => void;
  hasEditArea: boolean;
  settings: SmileSettings;
  onChange: (s: SmileSettings) => void;
  onGenerate: () => void;
  onCompare: () => void;
  onCompareMaterials: () => void;
  onHarmonise: () => void;
  busy: boolean;
  reference: Photo | null;
  onAddReference: () => void;
  onClearReference: () => void;
}) {
  const [tab, setTab] = useState<StudioTab>("teeth");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [individual, setIndividual] = useState(Boolean(settings.toothPlans));
  const change = <K extends keyof SmileSettings>(key: K, value: SmileSettings[K]) => onChange({ ...settings, [key]: value });
  const setTeeth = (teeth: TeethCount) => onChange({ ...settings, teeth, toothPlans: undefined, selectedTeeth: upperTeeth[teeth] });
  const noChange = isNoChangeDesign(settings);
  const shape = SHAPES.find(s => s.shape === settings.shape);
  const treatments = settings.treatment === "Composite"
    ? [{ value: "Composite" as Treatment, title: "Composite", detail: "Earlier general composite setting" }, ...TREATMENTS]
    : TREATMENTS;
  const index = TABS.findIndex(t => t.id === tab);
  const next = TABS[index + 1];
  const previous = TABS[index - 1];

  function go(to: StudioTab) {
    if (to === tab) return;
    setDirection(TABS.findIndex(t => t.id === to) > index ? "forward" : "back");
    setTab(to);
    document.querySelector(".studio-dock")?.scrollTo({ top: 0 });
  }

  const page = (id: StudioTab, children: React.ReactNode) => tab === id && (
    <section key={id} id={`studio-page-${id}`} role="tabpanel" aria-labelledby={`studio-tab-${id}`} className={`studio-card studio-page is-${direction}`}>
      {children}
    </section>
  );

  const alignment = settings.alignment;
  const alignedLabel = alignment ? `Straightened · ${alignment.arches === "Both" ? "both arches" : `${alignment.arches.toLowerCase()} arch`}` : "";
  const restoration = treatments.find(t => t.value === settings.treatment)?.title ?? settings.treatment;
  const summary: { id: StudioTab; value: string }[] = [
    { id: "teeth", value: alignment?.only ? `${alignment.arches === "Both" ? "Both arches" : `${alignment.arches} arch`} · positions only` : `${toothSummary(settings)}${settings.designIntent && settings.designIntent !== "Auto" ? ` · ${settings.designIntent}` : ""}` },
    { id: "shape", value: alignment?.only ? "Unchanged (alignment only)" : `${shape?.name ?? settings.shape} · ${settings.character}` },
    { id: "shade", value: alignment?.only ? "Kept (alignment only)" : QUICK_SHADES.find(q => q.value === settings.targetShade)?.label ?? settings.targetShade },
    { id: "treatment", value: alignment ? (alignment.only ? alignedLabel : `${alignedLabel} + ${restoration.toLowerCase()}`) : restoration },
  ];

  return (
    <div className="studio">
      <div className="studio-stage">{stage}</div>

      <div className="studio-dock">
        <div className="studio-tabs" role="tablist" aria-label="Design steps">
          {TABS.map(({ id, label, Icon }, i) => (
            <button key={id} id={`studio-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`studio-page-${id}`}
              className={`${tab === id ? "is-active" : ""}${i < index ? " is-done" : ""}`} onClick={() => go(id)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <fieldset disabled={busy} className="studio-cards" aria-label="Smile design controls">
          {page("teeth", <>
            <header className="studio-card-head">
              <h3>Teeth</h3>
              <p>Choose how many upper teeth to design, or plan each tooth.</p>
            </header>
            <div className="studio-arch" role="group" aria-label="Upper teeth to design">
              {ARCH.map(({ tooth, w, h }) => {
                const on = settings.selectedTeeth.includes(tooth);
                const count = TEETH_COUNTS.find(n => upperTeeth[n].includes(tooth)) ?? 10;
                return <button key={tooth} type="button" className={`studio-arch-tooth${on ? " on" : ""}`} style={{ width: w, height: h }}
                  aria-label={`Tooth ${tooth}${on ? ", included" : ""}. Design ${count} upper teeth`} aria-pressed={on}
                  disabled={individual} onClick={() => setTeeth(count)} />;
              })}
            </div>
            <div className="segmented studio-count" role="group" aria-label="Upper teeth">
              {TEETH_COUNTS.map(n => (
                <button key={n} type="button" aria-pressed={!individual && !settings.toothPlans && settings.teeth === n}
                  className={!individual && !settings.toothPlans && settings.teeth === n ? "selected" : ""}
                  onClick={() => { setIndividual(false); setTeeth(n); }}>{n}</button>
              ))}
            </div>
            <div className="segmented studio-mode" role="group" aria-label="Tooth selection">
              <button type="button" aria-pressed={!individual} className={!individual ? "selected" : ""} onClick={() => { setIndividual(false); if (settings.toothPlans) setTeeth(settings.teeth); }}>All teeth</button>
              <button type="button" aria-pressed={individual} className={individual ? "selected" : ""} onClick={() => setIndividual(true)}>Individual</button>
            </div>
            <p className="studio-summary"><strong>{toothSummary(settings)}</strong></p>
            {individual && <ToothChart settings={settings} onChange={onChange} defaultOpen />}
            <More>
              <div className="control-group">
                <label className="control-label" htmlFor="design-intent">Design goal</label>
                <select id="design-intent" className="design-select" value={settings.designIntent ?? "Auto"} onChange={e => change("designIntent", e.target.value as SmileSettings["designIntent"])}>{DESIGN_INTENTS.map(intent => <option key={intent}>{intent}</option>)}</select>
                <p className="control-hint">{resolveDesignPlan(settings).summary} Anatomy protection takes priority over notes and style preferences.</p>
              </div>
              <div className="control-group">
                <button type="button" className="secondary-button" onClick={onEditArea}>{hasEditArea ? "Review protected edit area" : "Protect edit area"}</button>
                <p className="control-hint">{hasEditArea ? "Only your painted area may change. Recheck it if you change teeth or design goal." : "Optional: paint the teeth and planned additions to keep gums and untreated teeth outside the edit. Runs on this device."}</p>
              </div>
              <SegmentedControl<ShotType> label="Photo type" options={["Full face", "Close-up"]} value={settings.shotType} onChange={v => change("shotType", v)} />
            </More>
          </>)}

          {page("shape", <>
            <header className="studio-card-head">
              <h3>Shape</h3>
              <p>Choose a tooth form that suits the patient’s features.</p>
            </header>
            <div className="studio-shapes" role="group" aria-label="Tooth shape">
              {SHAPES.map(s => (
                <button key={s.shape} type="button" className="studio-shape" aria-pressed={settings.shape === s.shape} onClick={() => change("shape", s.shape)}>
                  <span className="studio-shape-figure"><ToothForm shape={s.shape} /></span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            {shape && <p className="studio-summary"><strong>{shape.name}</strong><span>{shape.description}</span></p>}
            <SegmentedControl<SmileCharacter> label="Character" options={["Soft", "Balanced", "Defined"]} value={settings.character} onChange={v => change("character", v)} />
            <More>
              <div className="control-group">
                <div className="control-label"><span>Facial style reference</span><span className="muted">Harmony</span></div>
                <div className="segmented" role="group" aria-label="Face shape">
                  {(["Auto", "Square", "Ovoid", "Tapering"] as FaceShape[]).map(f => (
                    <button key={f} type="button" aria-pressed={settings.faceShape === f} className={settings.faceShape === f ? "selected" : ""} onClick={() => change("faceShape", f)}>{f}</button>
                  ))}
                </div>
                <p className="control-hint">{settings.faceShape === "Auto" ? "Uses visible proportions as context; it does not force a face-to-tooth shape match." : `Optional visual preference: ${settings.faceShape.toLowerCase()}. The selected goal and tooth form take priority.`}</p>
              </div>
              <SegmentedControl<TextureLevel> label="Texture" options={["Smooth", "Natural", "Textured"]} value={settings.texture} onChange={v => change("texture", v)} />
            </More>
          </>)}

          {page("shade", <>
            <header className="studio-card-head">
              <h3>Shade</h3>
              <p>Keep the current shade, brighten it, or aim for a specific shade.</p>
            </header>
            <div className="segmented" role="group" aria-label="Shade approach">
              {QUICK_SHADES.map(s => (
                <button key={s.value} type="button" aria-pressed={settings.targetShade === s.value} className={settings.targetShade === s.value ? "selected" : ""} onClick={() => change("targetShade", s.value)}>{s.label}</button>
              ))}
            </div>
            <div className="studio-swatches" role="group" aria-label="Target shade">
              {SHADES.map(s => (
                <button key={s.value} type="button" className="studio-swatch" aria-pressed={settings.targetShade === s.value} onClick={() => change("targetShade", s.value)}>
                  <span className="studio-swatch-chip" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0%, ${s.swatch} 55%, color-mix(in srgb, ${s.swatch} 82%, #b89c74) 100%)` }} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
            <p className="studio-summary"><strong>{QUICK_SHADES.find(s => s.value === settings.targetShade)?.label ?? settings.targetShade}</strong><span>{shadeDescription(settings.targetShade)}</span></p>
            <More>
              <div className="control-group">
                <div className="control-label"><span>Current shade</span><span className="muted">Clinician assessed</span></div>
                <div className="segmented" role="group" aria-label="Current shade">
                  {CURRENT_SHADES.map(s => <button key={s} type="button" aria-pressed={settings.currentShade === s} className={settings.currentShade === s ? "selected" : ""} onClick={() => change("currentShade", s)}>{s}</button>)}
                </div>
                <p className="control-hint">Used with a specific target shade. A photograph can’t diagnose shade; swatches are indicative.</p>
              </div>
              <div className="control-group">
                <div className="control-label"><label htmlFor="intensity">Result intensity</label></div>
                <input className="intensity-slider" id="intensity" type="range" min={0} max={100} value={settings.intensity}
                  aria-valuetext={`${settings.intensity} percent enhanced`} style={{ "--range": `${settings.intensity}%` } as React.CSSProperties}
                  onChange={e => change("intensity", Number(e.target.value))} />
                <div className="range-labels"><span>Subtle</span><span>Enhanced</span></div>
              </div>
            </More>
          </>)}

          {page("treatment", <>
            <header className="studio-card-head">
              <h3>Treatment</h3>
              <p>Straighten the teeth, restore them, or both.</p>
            </header>
            <div className="studio-align">
              <label className="studio-switch-row">
                <span className="studio-treatment-text"><strong>Straighten teeth</strong><small>Show the teeth aligned, as after orthodontics</small></span>
                <input type="checkbox" role="switch" className="studio-switch" checked={Boolean(alignment)}
                  onChange={e => change("alignment", e.target.checked ? { arches: "Both" } : undefined)} />
              </label>
              {alignment && <>
                <div className="segmented" role="group" aria-label="Arches to straighten">
                  {ALIGNMENT_ARCHES.map(a => (
                    <button key={a.value} type="button" aria-pressed={alignment.arches === a.value} className={alignment.arches === a.value ? "selected" : ""}
                      onClick={() => change("alignment", { ...alignment, arches: a.value })}>{a.label}</button>
                  ))}
                </div>
                <label className="studio-switch-row">
                  <span className="studio-treatment-text"><strong>Alignment only</strong><small>No bonding or veneers: shape and shade stay as they are</small></span>
                  <input type="checkbox" role="switch" className="studio-switch" checked={Boolean(alignment.only)}
                    onChange={e => change("alignment", { ...alignment, only: e.target.checked || undefined })} />
                </label>
                <p className="control-hint">A concept for discussion. Orthodontic suitability, timing and retention need assessment.</p>
              </>}
            </div>
            <div className={`studio-treatments${alignment?.only ? " is-muted" : ""}`} role="radiogroup" aria-label="Restoration" aria-disabled={alignment?.only || undefined}>
              {treatments.map(t => (
                <button key={t.value} type="button" role="radio" aria-checked={settings.treatment === t.value} className="studio-treatment" disabled={alignment?.only} onClick={() => change("treatment", t.value)}>
                  <span className="studio-treatment-text"><strong>{t.title}</strong><small>{t.detail}</small></span>
                  <span className="studio-check" aria-hidden="true">{settings.treatment === t.value && <Check size={14} strokeWidth={2.6} />}</span>
                </button>
              ))}
            </div>
            <More label="Notes, references and clinical detail">
              <div className="control-group">
                <div className="control-label"><label htmlFor="notes">Notes</label><span className="muted">Optional</span></div>
                <textarea id="notes" className="notes-field" rows={2} maxLength={400} placeholder="e.g. close the black triangles, lengthen the laterals slightly"
                  value={settings.notes} onChange={e => change("notes", e.target.value)} />
                <p className="control-hint">Design instructions only. Notes are sent with the photo for AI processing, so don’t include names or other identifying details.</p>
              </div>
              <div className="control-group">
                <div className="control-label"><span>Reference photo</span><span className="muted">Optional</span></div>
                {reference ? (
                  <div className="reference-preview">
                    <img src={reference.dataUrl} alt="Reference smile" />
                    <div className="reference-meta">
                      <span>Guides shape &amp; shade</span>
                      <button type="button" onClick={onClearReference}><X size={13} /> Remove</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="reference-add" onClick={onAddReference}><ImagePlus size={17} strokeWidth={1.6} />Add a smile they like</button>
                )}
              </div>
              <YourStyle settings={settings} onChange={onChange} />
              <div className="control-group">
                <label className="control-label" htmlFor="smile-arc">Smile arc</label>
                <select id="smile-arc" className="design-select" value={settings.smileArc ?? "Preserve existing"} onChange={e => change("smileArc", e.target.value as SmileSettings["smileArc"])}>
                  {smileArcs.map(arc => <option key={arc}>{arc}</option>)}
                </select>
                <p className="control-hint">The lower lip guides curvature, not tooth length. Existing edges stay protected unless you specify planned changes to those teeth in Notes.</p>
                {!canGuideSmileArc(settings) && settings.smileArc && settings.smileArc !== "Preserve existing" && <p className="control-hint" role="status">This preference is not applied: use a full-face photo with upper teeth set to Auto or Reshape. Shade-only, gap closure and local repairs retain the existing arc.</p>}
              </div>
              <div className="control-group">
                <label className="control-label" htmlFor="bite-context">Bite finding · clinician entered</label>
                <select id="bite-context" className="design-select" value={settings.biteContext ?? "Not assessed"} onChange={e => change("biteContext", e.target.value as SmileSettings["biteContext"])}>
                  {biteContexts.map(bite => <option key={bite}>{bite}</option>)}
                </select>
                <p className="control-hint">A smile photo cannot establish bite clearance. Recording a finding does not simulate its correction. Use Notes for assessed limitations.</p>
              </div>
              <ClinicalDataFields settings={settings} onChange={onChange} />
            </More>
          </>)}
          {page("review", <>
            <header className="studio-card-head">
              <h3>Review</h3>
              <p>Check the design, then generate. Tap a step to change it.</p>
            </header>
            <div className="studio-review" role="list">
              {summary.map(({ id, value }) => {
                const step = TABS.find(t => t.id === id)!;
                return <button key={id} type="button" role="listitem" className="studio-review-row" onClick={() => go(id)}>
                  <step.Icon size={20} />
                  <span className="studio-review-text"><small>{step.label}</small><strong>{value}</strong></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>;
              })}
            </div>
            <div className="studio-case">{caseBar}</div>
            <div className="studio-variations" role="group" aria-label="Or compare three options">
              <button type="button" className="studio-variation" disabled={busy || settings.designIntent === "Shade only"} onClick={onHarmonise}>
                <VisualiseSymbol size={20} /><span>3 harmonised</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
              <button type="button" className="studio-variation" disabled={busy || noChange} onClick={onCompareMaterials}>
                <CompareSymbol size={20} /><span>3 materials</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
              <button type="button" className="studio-variation" disabled={busy || settings.designIntent === "Shade only"} onClick={onCompare}>
                <ComposeSymbol size={20} /><span>3 shapes</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
            </div>
            <GenerationCosts {...costs} />
          </>)}
        </fieldset>

        <div className="studio-generate">
          {tab === "review" && noChange && <p className="control-hint">No change selected: select teeth to edit and choose a different shade or design goal. No generation is needed.</p>}
          <div className="studio-steps-nav">
            {previous && <button type="button" className="secondary-button studio-back" onClick={() => go(previous.id)} aria-label={`Back to ${previous.label}`}>
              <ChevronLeft size={18} aria-hidden="true" />Back
            </button>}
            {next ? (
              <button type="button" className="primary-button studio-next" onClick={() => go(next.id)}>
                Next: {next.label}<ChevronRight size={18} aria-hidden="true" />
              </button>
            ) : (
              <button className="primary-button generate-button" onClick={onGenerate} disabled={busy || noChange}>
                <VisualiseSymbol size={20} />
                {busy ? "Creating your visualisation…" : "Generate Smile"}
                {costs.open && !busy && <small className="action-cost">{allowanceLabel(1, costs.testMode)}</small>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
