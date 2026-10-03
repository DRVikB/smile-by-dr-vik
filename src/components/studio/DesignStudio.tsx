"use client";
import { generationUnavailable, INTERNAL_SINGLE_TOOTH, INTERNAL_ALIGNMENT, INTERNAL_FULL_ARCH } from "@/lib/generation/availability";
import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import type { CurrentShade, FaceShape, FullArchPlan, Photo, ShotType, SmileCharacter, SmileSettings, TargetShade, TeethCount, TextureLevel, Treatment } from "@/lib/types";
import { upperTeeth, smileArcs, biteContexts, isFullArch } from "@/lib/types";
import { chooseFullArch as withFullArch, chooseStandard as withStandard, chooseAlignment, normalizeTreatmentScope } from "@/lib/fullArch";
import { DESIGN_INTENTS, isNoChangeDesign, resolveDesignPlan } from "@/lib/generation/designPlan";
import { canGuideSmileArc } from "@/lib/smilePrinciples";
import { activeToothPlans, toothSummary } from "@/lib/teeth";
import { GenerationCosts, allowanceLabel, type GenerationCostsProps } from "@/components/GenerationCosts";
import { AllowanceBanner, AllowanceLine } from "@/components/account/Allowance";
import { SegmentedControl, SHAPES, ToothForm } from "./StudioParts";
import { ToothChart } from "@/components/ToothChart";
import { ClinicalDataFields } from "@/components/ClinicalDataFields";
import { YourStyle } from "@/components/caseLibrary/YourStyle";
import { CompareSymbol, ComposeSymbol, ShadeSymbol, ToothSymbol, TreatmentSymbol, VisualiseSymbol, type SmileIcon } from "@/components/icons/SmileIcons";
import { SelectedTeethSummary, SingleToothEdit, ToothControls, ToothMapStatus, ToothMapView, ToothPicking } from "@/components/toothMap/ToothMapPanel";
import type { ToothMapController } from "@/components/toothMap/useToothMap";
import { mappedTeeth, teethToReview } from "@/lib/toothMap/types";
import { ToothMapDebug } from "@/components/toothMap/ToothMapDebug";
import {generationProtectionPlan} from "@/lib/toothMap/protect";

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


const TREATMENTS: { value: Treatment; title: string; detail: string }[] = [
  { value: "Whitening", title: "Whitening", detail: "Colour only · keeps tooth shape and position" },
  { value: "Single-shade composite", title: "Composite bonding", detail: "Single shade · additive, conservative" },
  { value: "Layered composite", title: "Layered composite", detail: "Natural translucency and depth" },
  { value: "Porcelain", title: "Porcelain veneers", detail: "Uniform, high-lustre finish" },
];

const PROSTHETIC_GINGIVA: { value: FullArchPlan["prostheticGingiva"]; label: string }[] = [
  { value: "exclude", label: "Preserve" }, { value: "include", label: "Include" },
];
export const archLabel = (arch: FullArchPlan["arch"]) => (arch === "both" ? "Upper + Lower" : arch === "upper" ? "Upper" : "Lower");
export const restorationLabel = (r: FullArchPlan["restorationType"]) => (r === "zirconia" ? "Zirconia" : "Provisional");

/** The review drop-down's title: the detected map's state at a glance. */
function toothMapSummary(c: ToothMapController): string {
  if (c.status === "detecting") return "Tooth map · finding teeth…";
  if (c.status === "idle" && !c.map) return "Tooth map · optional";
  if (c.status === "none" || !c.map) return "Tooth map · add teeth";
  const check = teethToReview(c.map).length;
  if (c.map.confirmedByClinician) return "Tooth map · confirmed";
  return check ? `Review tooth map · ${check} to check` : "Review tooth map";
}

function shadeDescription(value: TargetShade) {
  return SHADES.find(s => s.value === value)?.description ?? QUICK_SHADES.find(s => s.value === value)?.description ?? "";
}

function More({ children, label = "More options" }: { children: React.ReactNode; label?: string }) {
  return <details className="studio-more">
    <summary>{label}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="studio-more-body">{children}</div>
  </details>;
}

/** V1 treatment choices reuse the existing settings and material controls. */
export function TreatmentOptions({ settings, onChange }: { settings: SmileSettings; onChange: (settings: SmileSettings) => void }) {
  const fullArch = isFullArch(settings);
  const alignment = Boolean(settings.alignment?.only) && !fullArch;
  const veneers = !fullArch && !alignment && settings.treatment !== "Whitening";
  const materials = settings.treatment === "Composite"
    ? [{ value: "Composite" as Treatment, title: "Composite", detail: "Earlier general composite setting" }, ...TREATMENTS.filter(t => t.value !== "Whitening")]
    : TREATMENTS.filter(t => t.value !== "Whitening");
  const standard = (treatment: Treatment) => onChange(withStandard(settings, { treatment, alignment: settings.alignment?.only ? undefined : settings.alignment }));
  return <>
    <div className="studio-treatments" role="radiogroup" aria-label="Treatment">
      <button type="button" role="radio" aria-checked={!fullArch && !alignment && settings.treatment === "Whitening"} className="studio-treatment" onClick={() => standard("Whitening")}>
        <span className="studio-treatment-text"><strong>Whitening</strong><small>Colour only · keeps natural tooth form</small></span>
        <span className="studio-check" aria-hidden="true">{!fullArch && !alignment && settings.treatment === "Whitening" && <Check size={14} strokeWidth={2.6} />}</span>
      </button>
      <button type="button" role="radio" aria-checked={veneers} className="studio-treatment" onClick={() => standard(settings.treatment === "Whitening" ? "Layered composite" : settings.treatment)}>
        <span className="studio-treatment-text"><strong>Veneers</strong><small>Composite or porcelain · shape, shade and surface character</small></span>
        <span className="studio-check" aria-hidden="true">{veneers && <Check size={14} strokeWidth={2.6} />}</span>
      </button>
      {INTERNAL_ALIGNMENT && <button type="button" role="radio" aria-checked={alignment} className="studio-treatment" onClick={() => onChange(chooseAlignment(settings))}>
        <span className="studio-treatment-text"><strong>Alignment</strong><small>Both arches · natural tooth shape and shade</small></span>
        <span className="studio-check" aria-hidden="true">{alignment && <Check size={14} strokeWidth={2.6} />}</span>
      </button>}
      {INTERNAL_FULL_ARCH && <button type="button" role="radio" aria-checked={fullArch} className="studio-treatment" onClick={() => onChange(withFullArch(settings))}>
        <span className="studio-treatment-text"><strong>Full Arch / All-on-X</strong><small>Both visible arches · zirconia restorative concept</small></span>
        <span className="studio-check" aria-hidden="true">{fullArch && <Check size={14} strokeWidth={2.6} />}</span>
      </button>}
    </div>
    {veneers && <div className="control-group">
      <div className="control-label">Veneer material</div>
      <div className="studio-treatments" role="radiogroup" aria-label="Veneer material">
        {materials.map(t => <button key={t.value} type="button" role="radio" aria-checked={settings.treatment === t.value} className="studio-treatment" onClick={() => standard(t.value)}>
          <span className="studio-treatment-text"><strong>{t.title}</strong><small>{t.detail}</small></span>
          <span className="studio-check" aria-hidden="true">{settings.treatment === t.value && <Check size={14} strokeWidth={2.6} />}</span>
        </button>)}
      </div>
    </div>}
    {INTERNAL_ALIGNMENT && !fullArch && !alignment && <div className="control-group">
      <button type="button" role="switch" aria-checked={Boolean(settings.alignment)} className="studio-treatment"
        onClick={() => onChange(withStandard(settings, { alignment: settings.alignment ? undefined : { arches: "Both" } }))}>
        <span className="studio-treatment-text"><strong>Include alignment</strong><small>A straighter smile alongside your selected treatment</small></span>
        <span className="studio-check" aria-hidden="true">{settings.alignment && <Check size={14} strokeWidth={2.6} />}</span>
      </button>
      {settings.alignment && <p className="control-hint">Both visible arches. Your selected teeth, material, shape and shade still apply. A visual concept, not orthodontic planning.</p>}
    </div>}
    {alignment && <p className="control-hint">A straighter-smile visualisation, not orthodontic planning. Root movement, bite, attachments and treatment staging are not simulated. Clinical assessment is required.</p>}
  </>;
}

export function DesignStudio({
  stage, caseBar, costs, onEditArea, hasEditArea, settings, onChange, onGenerate, onCompare, onCompareMaterials, onHarmonise,
  busy, reference, onAddReference, onClearReference, toothMap,
}: {
  /** The photograph (or before/after) shown in the studio frame; told when the Teeth step is open. */
  stage: React.ReactNode | ((teethStep: boolean) => React.ReactNode);
  /** The photo's tooth map: outlines on the photo, confirmation and corrections. */
  toothMap?: ToothMapController;
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
  const [individual, setIndividual] = useState(INTERNAL_SINGLE_TOOTH && Boolean(settings.toothPlans));
  const change = <K extends keyof SmileSettings>(key: K, value: SmileSettings[K]) => onChange({ ...settings, [key]: value });
  const setTeeth = (teeth: TeethCount) => onChange({ ...settings, teeth, toothPlans: undefined, selectedTeeth: upperTeeth[teeth] });
  const noChange = isNoChangeDesign(settings);
  const unavailable = generationUnavailable(settings);
  const fullArch = isFullArch(settings) ? settings.fullArch : null;
  const setFullArch = (patch: Partial<FullArchPlan>) => onChange(withFullArch(settings, patch));
  const mappedSelection = toothMap?.map ? settings.selectedTeeth.filter(t => mappedTeeth(toothMap.map).includes(t)) : [];
  const singleTooth = settings.selectedTeeth.length === 1 && mappedSelection.length === 1 ? mappedSelection[0] : null;
  const shape = SHAPES.find(s => s.shape === settings.shape);
  const treatments = settings.treatment === "Composite"
    ? [{ value: "Composite" as Treatment, title: "Composite", detail: "Earlier general composite setting" }, ...TREATMENTS]
    : TREATMENTS;
  const index = TABS.findIndex(t => t.id === tab);
  const next = TABS[index + 1];
  const previous = TABS[index - 1];

  function go(to: StudioTab) {
    if (to === tab) return;
    // Leaving the Teeth step finishes any Custom picking, so the map hides again on return.
    toothMap?.setPicking(false);
    setDirection(TABS.findIndex(t => t.id === to) > index ? "forward" : "back");
    setTab(to);
    document.querySelector(".studio-dock")?.scrollTo({ top: 0 });
  }

  const page = (id: StudioTab, children: React.ReactNode) => tab === id && (
    <section key={id} id={`studio-page-${id}`} role="tabpanel" aria-labelledby={`studio-tab-${id}`} className={`studio-card studio-page is-${direction}`}>
      {children}
    </section>
  );

  const alignment = normalizeTreatmentScope(settings).alignment;
  const precisionReady = Boolean(toothMap?.photoUrl&&generationProtectionPlan(toothMap.map,toothMap.photoUrl,settings).ok&&toothMap.status!=="refining");
  const suggestBoundaryReview = INTERNAL_SINGLE_TOOTH && !costs.testMode && !fullArch && !alignment && activeToothPlans(settings).length===1 && !precisionReady;
  const alignedLabel = alignment ? `Straightened · ${alignment.arches === "Both" ? "both arches" : `${alignment.arches.toLowerCase()} arch`}` : "";
  const restoration = treatments.find(t => t.value === settings.treatment)?.title ?? settings.treatment;
  const summary: { id: StudioTab; value: string }[] = fullArch ? [
    { id: "teeth", value: archLabel(fullArch.arch) },
    { id: "shape", value: `${shape?.name ?? settings.shape} · ${settings.character}` },
    { id: "shade", value: QUICK_SHADES.find(q => q.value === settings.targetShade)?.label ?? settings.targetShade },
    { id: "treatment", value: `Full-arch restoration · ${restorationLabel(fullArch.restorationType)}${fullArch.prostheticGingiva === "auto" ? "" : ` · ${fullArch.prostheticGingiva === "include" ? "with" : "no"} prosthetic gingiva`}` },
  ] : [
    { id: "teeth", value: alignment?.only ? `${alignment.arches === "Both" ? "Both arches" : `${alignment.arches} arch`} · positions only` : `${toothSummary(settings)}${settings.treatment === "Whitening" ? " · Colour only" : settings.designIntent && settings.designIntent !== "Auto" ? ` · ${settings.designIntent}` : ""}` },
    { id: "shape", value: alignment?.only ? "Unchanged (alignment only)" : settings.treatment === "Whitening" ? "Unchanged (whitening)" : `${shape?.name ?? settings.shape} · ${settings.character}` },
    { id: "shade", value: alignment?.only ? "Kept (alignment only)" : QUICK_SHADES.find(q => q.value === settings.targetShade)?.label ?? settings.targetShade },
    { id: "treatment", value: alignment ? (alignment.only ? alignedLabel : `${alignedLabel} + ${restoration.toLowerCase()}`) : restoration },
  ];

  return (
    <div className="studio">
      <div className="studio-stage">{typeof stage === "function" ? stage(tab === "teeth") : stage}</div>

      <div className="studio-dock">
        <div className="studio-tabs" role="tablist" aria-label="Design steps">
          {TABS.map(({ id, label: base, Icon }, i) => { const label = id === "teeth" && fullArch ? "Arch" : base; return (
            <button key={id} id={`studio-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`studio-page-${id}`}
              className={`${tab === id ? "is-active" : ""}${i < index ? " is-done" : ""}`} onClick={() => go(id)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ); })}
        </div>

        <fieldset disabled={busy} className="studio-cards" aria-label="Smile design controls">
          {page("teeth", alignment?.only && !fullArch ? <>
            <header className="studio-card-head"><h3>Alignment</h3><p>Both visible arches. Natural tooth shape and shade are retained.</p></header>
            <p className="control-hint">A visual guide to a straighter smile, not an orthodontic treatment plan.</p>
          </> : fullArch ? <>
            <header className="studio-card-head"><h3>Full Arch / All-on-X</h3><p>Both visible arches · Zirconia.</p></header>
            <p className="control-hint">Preview both arches as a matching pair. A visual restorative concept for discussion, with the existing lip and face protection.</p>
          </> : <>
            <header className="studio-card-head">
              <h3>Teeth</h3>
              <p>{INTERNAL_SINGLE_TOOTH ? "Choose how many upper teeth to design, or choose Custom for individual teeth." : "Choose how many upper teeth to design."}</p>
            </header>
            {!individual && <div className="studio-arch" role="group" aria-label="Upper teeth to design">
              {ARCH.map(({ tooth, w, h }) => {
                const on = settings.selectedTeeth.includes(tooth);
                const count = TEETH_COUNTS.find(n => upperTeeth[n].includes(tooth)) ?? 10;
                return <button key={tooth} type="button" className={`studio-arch-tooth${on ? " on" : ""}`} style={{ width: w, height: h }}
                  aria-label={`Tooth ${tooth}${on ? ", included" : ""}. Design ${count} upper teeth`} aria-pressed={on}
                  disabled={individual} onClick={() => setTeeth(count)} />;
              })}
            </div>}
            {/* Presets keep the existing generation baseline independent of detection. */}
            <div className="segmented studio-count" role="group" aria-label="Upper teeth">
              {TEETH_COUNTS.map(n => (
                <button key={n} type="button" aria-pressed={!individual && !settings.toothPlans && settings.teeth === n}
                  className={!individual && !settings.toothPlans && settings.teeth === n ? "selected" : ""}
                  onClick={() => { setIndividual(false); toothMap?.setPicking(false); setTeeth(n); }}>{n}</button>
              ))}
              {INTERNAL_SINGLE_TOOTH && <button type="button" aria-pressed={individual || Boolean(settings.toothPlans)} className={individual || settings.toothPlans ? "selected" : ""}
                onClick={() => { setIndividual(true); toothMap?.setPicking(true); }}>Custom</button>}
            </div>
            <SelectedTeethSummary settings={settings} notFound={INTERNAL_SINGLE_TOOTH && toothMap?.map ? settings.selectedTeeth.filter(t => !mappedTeeth(toothMap.map).includes(t)) : []} />
            {INTERNAL_SINGLE_TOOTH && toothMap?.map && <ToothPicking controller={toothMap} />}
            {INTERNAL_SINGLE_TOOTH && toothMap?.map && toothMap.mode === "single" && singleTooth !== null && <SingleToothEdit controller={toothMap} fdi={singleTooth} />}
            {INTERNAL_SINGLE_TOOTH && toothMap?.map && <p className="control-hint">{
              toothMap.mode === "select" ? `${toothMap.picking && toothMap.display === "auto" ? "" : "Tap a tooth on the photo to add or remove it. "}Press and hold a tooth for its own settings. Boundary protection is optional for single-tooth edits; multi-tooth concepts use automatic face protection.`
                : toothMap.mode === "single" ? `Tooth ${singleTooth ?? ""} is outlined on the photo. Tap it, or Design tooth ${singleTooth ?? ""}, for its own shape, length, width, edge and shade. ${precisionReady ? "Pixels outside the confirmed boundaries stay original. Check that the outlines match the tooth." : "Confirm its boundary for precise tooth protection; quick concepts use automatic face protection."}`
                  : toothMap.mode === "design" ? "Visual planning guides: tooth form, smile arc and midline. These guides do not constrain the generated smile."
                    : "Generate a quick concept now. Optional boundary protection is available for single-tooth edits; choose Custom to plan individual teeth."
            }</p>}
            {INTERNAL_SINGLE_TOOTH && toothMap?.map && teethToReview(toothMap.map).some(t => t.fdi !== null && settings.selectedTeeth.includes(t.fdi)) && (
              <p className="scale-notice" role="status"><span>Check the tooth map</span>Some selected teeth have uncertain numbers. Review the tooth map below so the right teeth change.</p>
            )}
            {/* Then how the map is shown on the photo. */}
            {INTERNAL_SINGLE_TOOTH && individual && <ToothChart settings={settings} onChange={onChange} defaultOpen />}
            {INTERNAL_SINGLE_TOOTH && toothMap?.controlsFor != null && <ToothControls fdi={toothMap.controlsFor} settings={settings} onChange={onChange} onClose={() => toothMap.openControls(null)} />}
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
            {/* The detected map: status, teeth to check, corrections. Open while reviewing. */}
            {INTERNAL_SINGLE_TOOTH && toothMap && (
              <details className="studio-more" open={toothMap.editing || toothMap.adding || toothMap.status === "none" || undefined}>
                <summary>{toothMapSummary(toothMap)}<ChevronDown size={16} aria-hidden="true" /></summary>
                <div className="studio-more-body">
                  <ToothMapView controller={toothMap} settings={settings} onShapeChange={shape => change("shape", shape)} />
                  <ToothMapStatus controller={toothMap} />
                  {toothMap.map && <ToothMapDebug map={toothMap.map} width={toothMap.photoSize.width} height={toothMap.photoSize.height} photo={toothMap.photoUrl ?? undefined} settings={settings} />}
                </div>
              </details>
            )}
          </>)}

          {page("shape", alignment?.only && !fullArch ? <><header className="studio-card-head"><h3>Shape</h3><p>Alignment retains natural tooth shape, edges and texture. Shape choices are kept for restorative concepts.</p></header></> : <>
            <header className="studio-card-head">
              <h3>Shape</h3>
              {settings.treatment === "Whitening" && !fullArch && <p>Whitening keeps tooth shape, edges and texture. These choices are retained for restorative treatments.</p>}
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

          {page("shade", alignment?.only && !fullArch ? <>
            <header className="studio-card-head"><h3>Shade</h3><p>Alignment keeps the photographed tooth shade. Shade choices are retained for whitening and restorative concepts.</p></header>
          </> : <>
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
                <div className="control-label"><span>Current shade</span><span className="muted">{settings.currentShadeSource === "clinician" ? "Clinician confirmed" : settings.currentShadeSource === "estimated" ? "Visual estimate" : "Not confirmed"}</span></div>
                <div className="segmented" role="group" aria-label="Current shade">
                  {CURRENT_SHADES.map(s => <button key={s} type="button" aria-pressed={settings.currentShadeSource === "clinician" && settings.currentShade === s} className={settings.currentShadeSource === "clinician" && settings.currentShade === s ? "selected" : ""} onClick={() => onChange({ ...settings, currentShade: s, currentShadeSource: "clinician" })}>{s}</button>)}
                </div>
                <p className="control-hint">Choose only after clinical assessment. An unconfirmed or estimated shade does not override the photograph; swatches are indicative.</p>
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
              <p>Choose how you’d like to transform the smile.</p>
            </header>
            <TreatmentOptions settings={settings} onChange={onChange} />
              {INTERNAL_FULL_ARCH && fullArch && (
                <div className="studio-full-arch">
                  <p className="studio-summary"><strong>Both visible arches</strong><span>Zirconia restoration</span></p>
                  <details className="studio-more studio-full-arch-advanced">
                    <summary>Advanced<ChevronRight size={16} aria-hidden="true" /></summary>
                    <div className="studio-more-body">
                      <div className="control-group">
                        <div className="control-label">Prosthetic gingiva</div>
                        <div className="segmented" role="group" aria-label="Prosthetic gingiva">
                          {PROSTHETIC_GINGIVA.map(g => <button key={g.value} type="button" aria-pressed={(fullArch.prostheticGingiva === "include" ? "include" : "exclude") === g.value} className={(fullArch.prostheticGingiva === "include" ? "include" : "exclude") === g.value ? "selected" : ""} onClick={() => setFullArch({ prostheticGingiva: g.value })}>{g.label}</button>)}
                        </div>
                        <p className="control-hint">Preserve keeps natural visible gums. Include permits changes to the selected prosthetic gum interface only.</p>
                      </div>
                    </div>
                  </details>
                  <p className="control-hint">A visual restorative concept. Implant position and number, surgical suitability and the final prosthesis need clinical and radiographic assessment.</p>
                </div>
              )}
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
            {!costs.testMode && <AllowanceBanner />}
            <div className="studio-review" role="list">
              {summary.map(({ id, value }) => {
                const step = TABS.find(t => t.id === id)!;
                return <button key={id} type="button" role="listitem" className="studio-review-row" onClick={() => go(id)}>
                  <step.Icon size={20} />
                  <span className="studio-review-text"><small>{id === "teeth" && fullArch ? "Arch" : step.label}</small><strong>{value}</strong></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>;
              })}
            </div>
            <div className="studio-case">{caseBar}</div>
            <div className="studio-variations" role="group" aria-label="Or compare three options">
              <button type="button" className="studio-variation" disabled={Boolean(unavailable) || busy || settings.designIntent === "Shade only" || (!fullArch && settings.treatment === "Whitening")} onClick={onHarmonise}>
                <VisualiseSymbol size={20} /><span>3 harmonised</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
              <button type="button" className="studio-variation" disabled={Boolean(unavailable) || busy || noChange || Boolean(fullArch)} onClick={onCompareMaterials}>
                <CompareSymbol size={20} /><span>3 materials</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
              <button type="button" className="studio-variation" disabled={Boolean(unavailable) || busy || settings.designIntent === "Shade only" || (!fullArch && settings.treatment === "Whitening")} onClick={onCompare}>
                <ComposeSymbol size={20} /><span>3 shapes</span>
                {costs.open && <small className="action-cost">{allowanceLabel(3, costs.testMode)}</small>}
              </button>
            </div>
            {!fullArch && settings.treatment === "Whitening" && <p className="control-hint">Whitening changes colour only. Shape and harmonised-design comparisons are unavailable for this treatment.</p>}
            <GenerationCosts {...costs} />
          </>)}
        </fieldset>

        <div className="studio-generate">
          {tab === "review" && !costs.testMode && <AllowanceLine />}
          {unavailable && <p className="control-hint" role="status">{unavailable}</p>}
          {tab === "review" && noChange && <p className="control-hint">No change selected: select teeth to edit and choose a different shade or design goal. No generation is needed.</p>}
          {tab === "review" && suggestBoundaryReview && <p className="control-hint">Ready to generate with automatic face protection. <button type="button" className="text-button" onClick={() => { go("teeth"); toothMap?.setEditing(true); }}>Optional tooth-map review</button></p>}
          <div className="studio-steps-nav">
            {previous && <button type="button" className="secondary-button studio-back" onClick={() => go(previous.id)} aria-label={`Back to ${previous.id === "teeth" && fullArch ? "Arch" : previous.label}`}>
              <ChevronLeft size={18} aria-hidden="true" />Back
            </button>}
            {next ? (
              <button type="button" className="primary-button studio-next" onClick={() => go(next.id)}>
                Next: {next.id === "teeth" && fullArch ? "Arch" : next.label}<ChevronRight size={18} aria-hidden="true" />
              </button>
            ) : (
              <button className="primary-button generate-button" onClick={onGenerate} disabled={Boolean(unavailable) || busy || noChange}>
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
