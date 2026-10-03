import { AI_CONCEPT_DISCLAIMER } from "./brand";
import { analysisRows, type AnalysisRow, type SmileAnalysis } from "./face/analysis";
import { impliesWhitening } from "./implications";
import { canGuideSmileArc } from "./smilePrinciples";
import { activeToothPlans, resolvedToothIntent, toothSummary } from "./teeth";
import type { CurrentShade, SmileArc, SmileSettings, TargetShade, TextureLevel, ToothShape, Treatment } from "./types";
import { FULL_ARCH_DISCLAIMER, fullArchLabel, isFullArch } from "./types";

/**
 * What a patient reads in the two exports — the Smile Preview and the
 * Consultation Report — worked out from the saved design and the on-device
 * face analysis. Pure, so it is tested.
 *
 * Patient-facing rules: British English; "could", "may" and "appears"; the
 * design is described, the patient's own anatomy is never called defective;
 * no degrees, confidence scores or diagnostic claims unless the clinician
 * asks for the technical detail.
 */

// ---------- The design, in patient words ----------

/** The app's own names (the Shape step), so the patient reads what the clinician chose. */
const SHAPE_NAMES: Record<ToothShape, string> = { Square: "Square", Rounded: "Round", Triangular: "Triangle" };

const TREATMENT_NAMES: Record<Treatment, string> = {
  Whitening: "Whitening",
  Composite: "Composite bonding",
  "Single-shade composite": "Composite bonding",
  "Layered composite": "Layered composite bonding",
  Porcelain: "Porcelain veneers",
};

const TARGET_SHADES: Record<TargetShade, string> = {
  "The same": "Your natural shade",
  Whiten: "A brighter shade",
  Bleach: "Bleach white",
  A1: "A1", B1: "B1", BL3: "BL3", BL2: "BL2", BL1: "BL1",
};

const TEXTURES: Record<TextureLevel, string> = { Smooth: "Smooth finish", Natural: "Natural texture", Textured: "Textured finish" };

const SMILE_LINES: Record<SmileArc, string> = {
  "Preserve existing": "Your natural smile line",
  "Follow lower lip": "Follows your lower lip",
  Flatter: "Slightly flatter",
  "More curved": "A softer curve",
};

export function isShadeOnly(s: SmileSettings): boolean {
  return !s.alignment?.only && activeToothPlans(s).every(p => resolvedToothIntent(s, p) === "Shade only");
}

const alignmentOnly = (s: SmileSettings) => Boolean(s.alignment?.only);

/** "Soft square": the tooth form with its character, as chosen on the Shape step. */
export function shapeLabel(s: Pick<SmileSettings, "shape" | "character">): string {
  const name = SHAPE_NAMES[s.shape];
  return s.character === "Balanced" ? name : `${s.character} ${name.toLowerCase()}`;
}

export const treatmentLabel = (t: Treatment) => TREATMENT_NAMES[t];
export const targetShadeLabel = (t: TargetShade) => TARGET_SHADES[t];
export const textureLabel = (t: TextureLevel) => TEXTURES[t];

/** "6 upper teeth". */
export const teethLabel = (s: Pick<SmileSettings, "selectedTeeth">) => toothSummary(s);

function arches(s: SmileSettings): string {
  const a = s.alignment?.arches ?? "Both";
  return a === "Both" ? "both arches" : `the ${a.toLowerCase()} arch`;
}

/** The smile line the design actually aims for: a preference this photo can't guide reads as the natural line. */
function smileLine(s: SmileSettings): SmileArc {
  const arc = s.smileArc ?? "Preserve existing";
  return arc !== "Preserve existing" && canGuideSmileArc(s) ? arc : "Preserve existing";
}

/** The design's main treatment, as a patient would say it. */
export function designHeadline(s: SmileSettings): string {
  if (isFullArch(s)) return "Full-arch restoration";
  if (alignmentOnly(s)) return "Orthodontic alignment";
  if (isShadeOnly(s)) return "Whitening";
  const treatment = treatmentLabel(s.treatment);
  return s.alignment ? `Alignment and ${treatment.charAt(0).toLowerCase()}${treatment.slice(1)}` : treatment;
}

export interface DesignSummary {
  /** "Composite bonding · 6 upper teeth" */
  headline: string;
  /** "Soft square · B1 · Natural texture" */
  detail: string;
}

/** The two lines under the Smile Preview's images: only what matters to the patient. */
export function designSummary(s: SmileSettings): DesignSummary {
  if (isFullArch(s)) {
    const l = fullArchLabel(s.fullArch);
    return { headline: `${l.treatment} · ${l.arch}`, detail: [l.restoration, shapeLabel(s), targetShadeLabel(s.targetShade)].join(" · ") };
  }
  if (alignmentOnly(s)) return { headline: `Orthodontic alignment · ${arches(s)}`, detail: "Your own tooth shape and shade" };
  if (isShadeOnly(s)) return { headline: `Whitening · ${teethLabel(s)}`, detail: targetShadeLabel(s.targetShade) };
  return {
    headline: `${designHeadline(s)} · ${teethLabel(s)}`,
    detail: [shapeLabel(s), targetShadeLabel(s.targetShade), textureLabel(s.texture)].join(" · "),
  };
}

/** "Your proposed smile": each chosen setting, leaving out anything that doesn't apply to this design. */
export function proposedSmileRows(s: SmileSettings, referenceUsed?: boolean): [string, string][] {
  const rows: [string, string][] = [["Treatment", designHeadline(s)]];
  if (isFullArch(s)) {
    const l = fullArchLabel(s.fullArch);
    rows.push(["Arch", l.arch], ["Restoration concept", l.restoration], ["Shape", shapeLabel(s)], ["Shade", targetShadeLabel(s.targetShade)]);
    return rows;
  }
  if (alignmentOnly(s)) {
    rows.push(["Teeth", arches(s).replace(/^the /, "").replace(/^\w/, c => c.toUpperCase())]);
  } else {
    rows.push(["Teeth", teethLabel(s)]);
    if (s.selectedTeeth.length) rows.push(["Selected teeth", s.selectedTeeth.join(", ")]);
    if (!isShadeOnly(s)) rows.push(["Tooth shape", shapeLabel(s)]);
    rows.push(["Target shade", targetShadeLabel(s.targetShade)]);
    if (!isShadeOnly(s)) {
      rows.push(["Texture", textureLabel(s.texture)]);
      rows.push(["Smile line", SMILE_LINES[smileLine(s)]]);
      rows.push(["Result intensity", `${s.intensity}% · subtle to enhanced`]);
    }
  }
  if (referenceUsed) rows.push(["Reference smile", "Included"]);
  return rows;
}

// ---------- Observations, with confidence ----------

export type ObservationMetric = "smile_balance" | "smile_centre" | "shade";
export type ObservationSource = "face-landmarks" | "design-settings" | "clinician";
export type ConfidenceBand = "high" | "medium" | "low";

/** One observation, with how sure the app is (never shown to the patient). */
export interface Observation {
  metric: ObservationMetric;
  title: string;
  /** The patient-facing sentence. */
  text: string;
  /** Machine value, e.g. "balanced". */
  value: string;
  /** 0–1. */
  confidence: number;
  source: ObservationSource;
}

/** High: included automatically. Medium: offered to the clinician to check. Low: left out. */
export function confidenceBand(confidence: number): ConfidenceBand {
  return confidence >= 0.8 ? "high" : confidence >= 0.55 ? "medium" : "low";
}

const clamp01 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

/**
 * Observations the face landmarks support: how level the smile reads against
 * the eyes, and how centred it sits. The landmarks don't find the teeth, so
 * nothing is said about tooth proportions, visible teeth or the incisal smile
 * arc — those are never guessed.
 */
export function smileObservations(a: SmileAnalysis | null): Observation[] {
  if (!a) return [];
  // Less sure when the head is turned in the photo or the face is small in the frame.
  const tilt = Math.abs(a.headTiltDeg);
  const penalty = (tilt > 6 ? 0.2 : tilt > 3 ? 0.08 : 0) + (a.mmPerPx === null ? 0.15 : 0);
  const out: Observation[] = [];

  const cant = Math.abs(a.cantDeg);
  out.push(cant < 2
    ? { metric: "smile_balance", title: "Smile balance", value: "balanced", text: "Your smile appears visually balanced overall.", confidence: clamp01(0.92 - cant * 0.04 - penalty), source: "face-landmarks" }
    : cant < 4
      ? { metric: "smile_balance", title: "Smile balance", value: "slightly_uneven", text: "Your smile line appears to rise very slightly towards one side.", confidence: clamp01(0.66 - penalty), source: "face-landmarks" }
      : { metric: "smile_balance", title: "Smile balance", value: "uneven", text: "Your smile line appears to rise gently towards one side.", confidence: clamp01(0.6 - penalty), source: "face-landmarks" });

  const offset = a.smileWidthPx ? Math.abs(a.midlineOffsetPx) / a.smileWidthPx * 100 : 0;
  out.push(offset < 3
    ? { metric: "smile_centre", title: "Smile centre", value: "centred", text: "Your smile appears well centred within your face.", confidence: clamp01(0.9 - offset * 0.02 - penalty), source: "face-landmarks" }
    : offset < 6
      ? { metric: "smile_centre", title: "Smile centre", value: "slightly_off_centre", text: "Your smile appears to sit very slightly to one side of the centre of your face.", confidence: clamp01(0.62 - penalty), source: "face-landmarks" }
      : { metric: "smile_centre", title: "Smile centre", value: "off_centre", text: "Your smile appears to sit a little to one side of the centre of your face.", confidence: clamp01(0.56 - penalty), source: "face-landmarks" });
  return out;
}

/**
 * The shade today. A photograph can't measure shade (lighting, white balance,
 * exposure, camera and screen all change it), so unless the clinician has
 * confirmed it this is always an estimated visual shade, offered for review.
 */
export function shadeObservation(shade: CurrentShade | null, confirmed: boolean): Observation | null {
  if (!shade) return null;
  return confirmed
    ? { metric: "shade", title: "Shade", value: shade, text: `Your current shade was assessed at around ${shade}.`, confidence: 1, source: "clinician" }
    : { metric: "shade", title: "Shade", value: shade, text: `The current photograph appears around ${shade}. This is an estimated visual shade and requires clinical confirmation.`, confidence: 0.6, source: "design-settings" };
}

// ---------- Priorities ----------

export interface Priority {
  title: string;
  text: string;
}

/**
 * "What could make the biggest difference": at most three, from what the
 * design sets out to change. Positive design language only.
 */
export function designPriorities(s: SmileSettings): Priority[] {
  const out: Priority[] = [];
  const shadeOnly = isShadeOnly(s);
  if (s.alignment) out.push({ title: "Straighten the smile", text: "Aligning the teeth could create a more even arch, with any cosmetic refinement added afterwards." });
  if (!shadeOnly && !alignmentOnly(s)) {
    if (s.designIntent === "Close gaps") out.push({ title: "Close small spaces", text: "Gently closing small spaces could create a more continuous, even smile." });
    if (s.designIntent === "Repair edges") out.push({ title: "Smooth the tooth edges", text: "Creating smoother, more consistent tooth edges could make the smile appear more harmonious." });
    if (s.designIntent === "Reshape" || ((s.designIntent ?? "Auto") === "Auto" && s.intensity >= 30))
      out.push({ title: "Refine tooth proportions", text: `A ${shapeLabel(s).toLowerCase()} outline could give the front teeth a more balanced, refined appearance.` });
    const line = smileLine(s);
    if (line === "Follow lower lip" || line === "More curved") out.push({ title: "Soften the smile line", text: "A gentle curve that follows the lower lip could give the smile a softer, more youthful line." });
    if (line === "Flatter") out.push({ title: "Calm the smile line", text: "A slightly flatter smile line could give a more even, understated look." });
  }
  if (!alignmentOnly(s) && (s.targetShade === "Whiten" || s.targetShade === "Bleach" || impliesWhitening(s)))
    out.push({ title: "Brighten the smile", text: "A lighter overall shade could create a fresher result while maintaining a natural appearance." });
  if (!out.length && !alignmentOnly(s)) out.push({ title: "Refine the details", text: "Small refinements to shape and finish could help the smile look fresh while staying natural." });
  return out.slice(0, 3);
}

// ---------- Today vs proposed ----------

export interface ComparisonRow {
  feature: string;
  today: string;
  proposed: string;
}

const UNKNOWN = "—";

function styleLabel(s: SmileSettings): string {
  const band = s.intensity <= 25 ? "Subtle refinement" : s.intensity <= 55 ? "Natural refinement" : "Enhanced";
  return `${band} · ${textureLabel(s.texture).toLowerCase()}`;
}

/** Only what the case records: what today looks like is left as "—" unless it is known. */
export function todayVsProposed(s: SmileSettings, shade: { value: CurrentShade; confirmed: boolean } | null): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  if (!alignmentOnly(s))
    rows.push({ feature: "Shade", today: shade ? (shade.confirmed ? shade.value : `Around ${shade.value} (estimated)`) : UNKNOWN, proposed: targetShadeLabel(s.targetShade) });
  if (!isShadeOnly(s) && !alignmentOnly(s)) {
    rows.push({ feature: "Shape", today: UNKNOWN, proposed: shapeLabel(s) });
    const line = smileLine(s);
    if (line !== "Preserve existing") rows.push({ feature: "Smile line", today: UNKNOWN, proposed: SMILE_LINES[line] });
  }
  if (s.alignment) rows.push({ feature: "Alignment", today: UNKNOWN, proposed: `Straighter · ${arches(s)}` });
  if (!alignmentOnly(s)) rows.push({ feature: "Treatment area", today: UNKNOWN, proposed: teethLabel(s) });
  if (!isShadeOnly(s) && !alignmentOnly(s)) rows.push({ feature: "Overall style", today: UNKNOWN, proposed: styleLabel(s) });
  return rows;
}

// ---------- What this may involve ----------

export interface OverviewItem {
  title: string;
  text: string;
  bullets?: string[];
}

export const ASSESSMENT_CHECKS = [
  "Bite and tooth wear",
  "Gum health and gum levels",
  "Existing restorations and decay",
  "Crowding or rotations",
  "Enamel quality",
  "Treatment suitability",
];

/** The practical explanation for the selected treatment. Suitability is always the clinician's to confirm. */
export function treatmentOverview(s: SmileSettings): OverviewItem[] {
  const items: OverviewItem[] = [];
  if (isFullArch(s)) {
    const l = fullArchLabel(s.fullArch);
    items.push({ title: `${l.treatment} · ${l.arch.toLowerCase()} · ${l.restoration.toLowerCase()}`, text: `A fixed full-arch prosthesis replaces the visible teeth of the ${l.arch === "Upper + Lower" ? "upper and lower arches" : `${l.arch.toLowerCase()} arch`}. ${FULL_ARCH_DISCLAIMER}` });
    items.push({ title: "Clinical assessment still required", text: "Before treatment your clinician will confirm factors including:", bullets: ASSESSMENT_CHECKS });
    return items;
  }
  if (s.alignment)
    items.push({ title: `Orthodontic alignment of ${arches(s)}`, text: "Clear aligners or braces could straighten the teeth. Whether they suit you, how long treatment would take and how the result is kept afterwards are confirmed at an orthodontic assessment." });
  if (!alignmentOnly(s)) {
    if (isShadeOnly(s))
      items.push({ title: "Whitening", text: "Professional whitening could lighten your natural teeth gradually. How much lighter they can become varies from person to person, and existing fillings or crowns do not whiten." });
    else if (s.treatment === "Porcelain")
      items.push({ title: `Porcelain veneers on ${teethLabel(s)}`, text: "Porcelain veneers are made in a dental laboratory and bonded to the front of the teeth. They usually need some reshaping of the tooth surface, which cannot be reversed, and typically take two or three visits." });
    else
      items.push({ title: `${treatmentLabel(s.treatment)} on ${teethLabel(s)}`, text: "Composite is usually added to the tooth surface and can often require little or no enamel removal. It may require polishing, repair or replacement over time." });
    if (!isShadeOnly(s) && activeToothPlans(s).some(p => impliesWhitening({ currentShade: s.currentShade, targetShade: p.targetShade ?? s.targetShade })))
      items.push({ title: "Discuss whitening and shade matching", text: "Natural teeth are often whitened before final colour matching when a brighter result is planned." });
  }
  items.push({ title: "Clinical assessment still required", text: "Before treatment your clinician will confirm factors including:", bullets: ASSESSMENT_CHECKS });
  return items;
}

export const NEXT_STEPS = "Your clinician will talk this concept through with you, confirm what is suitable at a clinical assessment and agree a treatment plan with you before anything begins.";

export const PREVIEW_DISCLAIMER = AI_CONCEPT_DISCLAIMER;

export const REPORT_DISCLAIMER = AI_CONCEPT_DISCLAIMER;

export const DEMO_DISCLAIMER = "Demo preview — sample imagery, not a patient result.";

// ---------- The clinician's review ----------

export interface ReportSections {
  observations: boolean;
  design: boolean;
  treatment: boolean;
  comparison: boolean;
  /** Degrees and the reference-line figure: off unless the clinician asks. */
  technical: boolean;
}

export interface ReviewedObservation extends Observation {
  include: boolean;
  band: ConfidenceBand;
}

export interface ReviewedPriority extends Priority {
  include: boolean;
}

/** Everything the clinician can change before the report is made; stored with the case to make it again. */
export interface ReportDraft {
  sections: ReportSections;
  observations: ReviewedObservation[];
  priorities: ReviewedPriority[];
  shade: { value: CurrentShade | null; confirmed: boolean; include: boolean };
  note: string;
  /** Patient first name or case reference: optional, never the full name by default. */
  patientLabel: string;
  /** ISO date of the consultation. */
  date: string;
}

export const NOTE_MAX = 600;
export const OBSERVATION_MAX = 240;

export function initialReportDraft(input: {
  settings?: SmileSettings;
  analysis: SmileAnalysis | null;
  patientLabel?: string;
  now?: Date;
}): ReportDraft {
  const { settings } = input;
  const observations = smileObservations(input.analysis)
    .map(o => ({ ...o, band: confidenceBand(o.confidence) }))
    .filter(o => o.band !== "low")
    .map(o => ({ ...o, include: o.band === "high" }));
  return {
    sections: { observations: true, design: Boolean(settings), treatment: Boolean(settings), comparison: Boolean(settings), technical: false },
    observations,
    priorities: settings ? designPriorities(settings).map(p => ({ ...p, include: true })) : [],
    // An estimate from the design settings is medium confidence: offered, not included.
    shade: { value: settings?.currentShadeSource && !settings.alignment?.only ? settings.currentShade ?? null : null, confirmed: settings?.currentShadeSource === "clinician", include: false },
    note: "",
    patientLabel: input.patientLabel?.trim() ?? "",
    date: (input.now ?? new Date()).toISOString(),
  };
}

/** A clinician edit makes the observation the clinician's own. */
export function editObservation(o: ReviewedObservation, text: string): ReviewedObservation {
  return { ...o, text: text.slice(0, OBSERVATION_MAX), source: "clinician", confidence: 1, band: "high" };
}

// ---------- What the report says ----------

export interface ReportContent {
  patientLabel: string;
  date: string;
  design: [string, string][] | null;
  glance: { title: string; text: string }[];
  priorities: Priority[];
  comparison: ComparisonRow[] | null;
  overview: OverviewItem[] | null;
  note: string | null;
  nextSteps: string;
  technical: AnalysisRow[] | null;
  disclaimer: string;
}

export function reportDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function reportContent(
  draft: ReportDraft,
  input: { settings?: SmileSettings; referenceUsed?: boolean; analysis: SmileAnalysis | null; isDemo?: boolean },
): ReportContent {
  const { settings } = input;
  const shade = draft.shade.value && draft.shade.include ? shadeObservation(draft.shade.value, draft.shade.confirmed) : null;
  const glance = draft.sections.observations
    ? [...draft.observations.filter(o => o.include && o.text.trim()), ...(shade ? [shade] : [])].map(o => ({ title: o.title, text: o.text.trim() }))
    : [];
  return {
    patientLabel: draft.patientLabel.trim(),
    date: reportDate(draft.date),
    design: settings && draft.sections.design ? proposedSmileRows(settings, input.referenceUsed) : null,
    glance,
    priorities: draft.priorities.filter(p => p.include && p.title.trim()).slice(0, 3),
    comparison: settings && draft.sections.comparison
      ? todayVsProposed(settings, draft.shade.value && draft.shade.include ? { value: draft.shade.value, confirmed: draft.shade.confirmed } : null)
      : null,
    overview: settings && draft.sections.treatment ? treatmentOverview(settings) : null,
    note: draft.note.trim() ? draft.note.trim().slice(0, NOTE_MAX) : null,
    nextSteps: NEXT_STEPS,
    technical: draft.sections.technical && input.analysis ? analysisRows(input.analysis) : null,
    disclaimer: input.isDemo ? `${DEMO_DISCLAIMER} ${REPORT_DISCLAIMER}` : REPORT_DISCLAIMER,
  };
}

// ---------- Records kept with the case ----------

export type ExportKind = "preview" | "report";

export const EXPORT_NAMES: Record<ExportKind, string> = { preview: "Smile Preview", report: "Consultation Report" };

/** A record of what was made, not the file: exports are made again from the saved case. */
export interface ExportRecord {
  kind: ExportKind;
  createdAt: number;
  /** The report's settings as reviewed, so it can be made again exactly. */
  draft?: ReportDraft;
}

export const EXPORT_HISTORY_MAX = 20;
