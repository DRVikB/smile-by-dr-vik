import type { PhotoQuality } from "./photoQuality";

export type Screen = "start" | "photo" | "design" | "compare" | "preview";
export type TeethCount = 4 | 6 | 8 | 10;
export type Treatment = "Whitening" | "Composite" | "Single-shade composite" | "Layered composite" | "Porcelain";
export type DesignIntent = "Auto" | "Shade only" | "Repair edges" | "Close gaps" | "Reshape";
export const smileArcs = ["Preserve existing", "Follow lower lip", "Flatter", "More curved"] as const;
export type SmileArc = typeof smileArcs[number];
export const biteContexts = ["Not assessed", "Deep bite", "Edge-to-edge", "Open bite", "Crossbite", "Other concern"] as const;
export type BiteContext = typeof biteContexts[number];
export type ToothCondition = "Natural" | "Restored" | "Missing";
export const toothShapes = ["Natural", "Soft square", "Square", "Rounded"] as const;
export const toothEdges = ["Natural", "Level", "Soft"] as const;
export interface ToothPlan {
  tooth: number;
  intent: DesignIntent | "Preserve";
  condition: ToothCondition;
  targetShade?: TargetShade;
  /** Individual tooth design (Tooth Map controls). Absent means follow the global design. */
  shape?: typeof toothShapes[number];
  /** −1 slightly shorter, 0 as photographed, 1 slightly longer. */
  length?: -1 | 0 | 1;
  /** −1 slightly narrower, 0 as photographed, 1 slightly wider (within its own space). */
  width?: -1 | 0 | 1;
  edge?: typeof toothEdges[number];
}
export const caseFeatures = ["Wear / chips", "Gaps", "Crowding / rotations", "Dark shade", "High gum display", "Recession / black triangles"] as const;
export type CaseFeature = typeof caseFeatures[number];
export const adjunctTreatments = ["Whitening", "Orthodontics", "Gum treatment"] as const;
export interface CaseContext {
  features: CaseFeature[];
  teeth: number[];
  adjuncts: (typeof adjunctTreatments[number])[];
  followUpWeeks?: number;
}
export interface ClinicianReview {
  reviewer: string;
  reviewedAt: number;
  notes: string;
}
export type CurrentShade = "A3" | "A2" | "A1" | "B1";
/** Which arches an orthodontic alignment concept straightens. */
export type AlignmentArches = "Upper" | "Lower" | "Both";

/**
 * Full-arch restoration: a whole-arch fixed restorative concept (e.g. an
 * implant-supported bridge). Structured so generation, reports, saved cases
 * and future lab briefs read the same values; never only prompt text.
 */
export type TreatmentMode = "standard" | "full_arch";
export const fullArchArches = ["upper", "lower", "both"] as const;
export const fullArchRestorations = ["zirconia", "provisional"] as const;
export const prostheticGingivaOptions = ["auto", "include", "exclude"] as const;
export interface FullArchPlan {
  arch: typeof fullArchArches[number];
  /** "provisional" is PMMA / a provisional prosthesis. */
  restorationType: typeof fullArchRestorations[number];
  prostheticGingiva: typeof prostheticGingivaOptions[number];
}
export const DEFAULT_FULL_ARCH: FullArchPlan = { arch: "upper", restorationType: "zirconia", prostheticGingiva: "exclude" };
export const FULL_ARCH_DISCLAIMER = "Visual restorative concept only. Final implant position, implant number, surgical suitability and definitive prosthetic design require clinical and radiographic assessment.";

/** "Full-arch restoration · Zirconia · Upper + Lower": the treatment in words, for summaries and reports. */
export function fullArchLabel(plan: FullArchPlan): { treatment: string; arch: string; restoration: string } {
  return {
    treatment: "Full-arch restoration",
    arch: plan.arch === "both" ? "Upper + Lower" : plan.arch === "upper" ? "Upper" : "Lower",
    restoration: plan.restorationType === "zirconia" ? "Zirconia" : "Provisional",
  };
}

/** Whether the design is a full-arch restoration (older cases without the field are standard). */
export function isFullArch(s: Pick<SmileSettings, "treatmentMode" | "fullArch">): s is Pick<SmileSettings, "treatmentMode"> & { fullArch: FullArchPlan } {
  return s.treatmentMode === "full_arch" && Boolean(s.fullArch);
}
export type TargetShade = "The same" | "Whiten" | "Bleach" | "A1" | "B1" | "BL3" | "BL2" | "BL1";
export type ToothShape = "Square" | "Rounded" | "Triangular" | "Rectangular";
export type TextureLevel = "Smooth" | "Natural" | "Textured";
export type ShotType = "Full face" | "Close-up";
export type FaceShape = "Auto" | "Square" | "Ovoid" | "Tapering";
export type SmileCharacter = "Soft" | "Balanced" | "Defined";

/** How a finished case in the style library was built. */
export type CaseMaterial =
  | "Single-shade composite"
  | "Layered composite"
  | "Porcelain";
export const caseMaterials: CaseMaterial[] = [
  "Single-shade composite",
  "Layered composite",
  "Porcelain",
];

/**
 * One of the clinician's own finished cases, kept as a style reference.
 * Metadata only — the images live in LibraryCaseMedia so the grid can list
 * a large library without loading every photograph.
 */
export interface LibraryCase {
  id: string;
  material: CaseMaterial;
  label: string;
  addedAt: number;
  context?: CaseContext;
  /** Held-out outcomes are never attached to a generation. */
  validationOnly?: boolean;
}
export interface LibraryCaseMedia {
  id: string;
  /** Downscaled for sending to the model: style, not resolution, is the point. */
  image: string;
  thumb: string;
  beforeImage?: string;
}
/** Portable library file, so a library can be handed to another clinician. */
export interface LibraryExport {
  version: 1;
  exportedAt: number;
  cases: (LibraryCase & { image: string; thumb: string; beforeImage?: string })[];
}
export interface SmileSettings {
  clinicalData?: {
    overbiteMm?: number;
    overjetMm?: number;
    restorativeSpace?: "Not assessed" | "Limited / uncertain" | "Assessed for planned changes";
    constraints?: string;
    patientPriorities?: string;
  };
  teeth: TeethCount;
  selectedTeeth: number[];
  toothPlans?: ToothPlan[];
  caseFeatures?: CaseFeature[];
  treatment: Treatment;
  /** Explicit Whitening alongside veneers; uses the same selected teeth and target shade. */
  whitening?: boolean;
  /**
   * Orthodontic alignment concept: show the visible teeth of these arches
   * straightened. Off when absent. `only` means no restorative change: teeth
   * move, but keep their own shape, size and shade.
   */
  alignment?: { arches: AlignmentArches; only?: boolean };
  /** Absent in older cases: standard. Full-arch replaces tooth selection, restoration material and alignment. */
  treatmentMode?: TreatmentMode;
  fullArch?: FullArchPlan;
  designIntent?: DesignIntent;
  smileArc?: SmileArc;
  /** Clinician-entered context, never inferred from a smile photograph. */
  biteContext?: BiteContext;
  currentShade?: CurrentShade;
  /** Absent on legacy cases: never interpret the old A2 default as confirmed. */
  currentShadeSource?: "clinician" | "estimated";
  targetShade: TargetShade;
  shape: ToothShape;
  texture: TextureLevel;
  shotType: ShotType;
  faceShape: FaceShape;
  character: SmileCharacter;
  /** Use the clinician's own finished cases as a style reference. */
  libraryStyle: boolean;
  intensity: number;
  notes: string;
}
/** A region of the frame, as fractions of its width and height. */
export interface Framing {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Where the capture guide asks the smile to sit within the frame. */
export const SMILE_GUIDE: Framing = {
  x: 0.3,
  y: 0.54,
  width: 0.4,
  height: 0.15,
};
export interface Photo {
  sourceProvenance?: "prepared" | "original" | "legacy-prepared-original";
  analysisSnapshot?: import("@/services/cases/sync/analysisSnapshot").AnalysisSnapshot;
  /** Device-local painted edit permissions; never sent to the provider. */
  editMask?: string;
  /** Every visible tooth as its own region (on-device); only selected teeth may change. */
  toothMap?: import("./toothMap/types").ToothMap;
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  isSample?: boolean;
  framing?: Framing;
  /** A quick local read on sharpness/exposure, advisory only. */
  quality?: PhotoQuality;
}
export interface PreviewPreferences {
  settings: SmileSettings;
  referenceUsed?: boolean;
  styleReferenceStatus?: "used" | "no-match" | "unavailable" | "off";
  styleReferenceCount?: number;
  testMode?: boolean;
}
/** Where a visualisation came from. Stored with results; never shown as UI copy. */
export interface GenerationMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  pipelineVersion?: string;
  treatmentPromptVersion?: string;
  generatedAt: string;
  mode?: import("./generation/modes").GenerationMode;
}
export interface GenerationResult {
  generation?: GenerationMetadata;
  elapsedSeconds?: number;
  review?: ClinicianReview;
  requestFingerprint?: string;
  /** The app's request id for this generation (links optional style feedback). */
  requestId?: string;
  /** How many Case Library references the server attached, and which cases. */
  styleReferencesUsed?: { count: number; caseIds: string[] };
  cost?: import("./generation/cost").CostReceipt;
  preferences?: PreviewPreferences;
  image: string;
  mode: "mock" | "live";
  variationId: string;
  /** Advisory only: a rough local check that the edit didn't grow past the
   *  capture guide by more than a reasonable margin. Unset when there was
   *  no guide region to check against (e.g. an uploaded photo). */
  scaleFlag?: "ok" | "grew";
  /** Everything outside the lips was restored to the original photograph. */
  faceLocked?: boolean;
  editAreaProtected?: boolean;
  /** The edit moved the lip border itself, not only the teeth. */
  lipsMoved?: boolean;
  /** Tooth Map protection: only these teeth could change; everything else is the original photo. */
  toothProtection?: ToothProtection;
}
export interface ToothProtection {
  /** Selected teeth that were found in the photo and allowed to change. */
  teeth: number[];
  /** Full-arch: the one arch allowed to change (the opposite arch was protected). */
  arch?: "upper" | "lower";
  /** Selected teeth the photo doesn't show (or the map doesn't have): left unchanged. */
  notFound: number[];
  /** Share of protected pixels the AI changed before protection (restored from the original). */
  restoredShare: number;
  /** After protection, share of protected pixels still different beyond compression noise (should be 0). */
  outsideChange: number;
  /** Share of the allowed region that visibly changed. */
  insideChange: number;
  verified: boolean;
}
export interface SmileVariant {
  label: string;
  note: string;
  patch: Partial<SmileSettings>;
  settings: SmileSettings;
  result: GenerationResult;
}
export interface CaseLogEntry {
  draftOnly?: boolean;
  id: string;
  /** Groups visualisations of the same case. Absent on entries saved before cases existed. */
  caseId?: string;
  patientName: string;
  createdAt: number;
  mode: "mock" | "live";
  testMode?: boolean;
  label?: string;
  summary: string;
  thumb: string;
  /** Archived: hidden from the main list, kept on this device. */
  archivedAt?: number;
  /** In Recently Deleted: permanently removed after RECENTLY_DELETED_DAYS. */
  deletedAt?: number;
  /** Starred by the clinician as a version worth keeping or showing. */
  favourite?: boolean;
  /** What was sent to the patient from this version, newest first: records only, made again on demand. */
  exports?: import("./consultation").ExportRecord[];
}
export interface CaseLogMedia {
  photoMetadata?: Omit<Photo,"dataUrl"|"editMask">;
  analysisSnapshot?: import("@/services/cases/sync/analysisSnapshot").AnalysisSnapshot;
  id: string;
  image: string;
  originalImage: string;
  /** Optional for legacy cases, which stored only the two images. */
  preferences?: PreviewPreferences;
  /** Review belongs to this saved image version, not the editable draft. */
  review?: ClinicianReview;
  scaleFlag?: GenerationResult["scaleFlag"];
  /** Local clinician attestation for the AI processing used to make this image. */
  aiConsent?: import("./aiConsent").AiProcessingConsent;
  generation?: GenerationMetadata;
  toothProtection?: ToothProtection;
}
/** The clinician's per-case confirmation of authority to process this patient's media. */
export interface UploadAuthority {
  version: string;
  confirmedAt: number;
}
export interface SmileCase {
  preferredDesignId?: string | null;
  /** Patient goals and words for this case; never part of a generation request. */
  consultation?: import("./caseConsultation").CaseConsultation;
  /** Stable ID for the working case; see SmileComposeCase in src/models/case.ts. */
  caseId?: string;
  uploadAuthority?: UploadAuthority | null;
  validationCaseId?: string;
  requestLimit?: number;
  costs?: import("./generation/cost").CaseCosts;
  resolution?: import("./generation/cost").ImageResolution;
  patientName?: string;
  aiConsent?: import("./aiConsent").AiProcessingConsent | null;
  variants?: SmileVariant[];
  reference?: Photo | null;
  testMode?: boolean;
  testPreview?: string | null;
  photo: Photo;
  settings: SmileSettings;
  result: GenerationResult | null;
  screen: Screen;
}
export const upperTeeth: Record<TeethCount, number[]> = {
  4: [12, 11, 21, 22],
  6: [13, 12, 11, 21, 22, 23],
  8: [14, 13, 12, 11, 21, 22, 23, 24],
  10: [15, 14, 13, 12, 11, 21, 22, 23, 24, 25],
};
export const defaultSettings: SmileSettings = {
  teeth: 8,
  selectedTeeth: upperTeeth[8],
  treatment: "Single-shade composite",
  designIntent: "Auto",
  smileArc: "Preserve existing",
  biteContext: "Not assessed",
  targetShade: "Whiten",
  shape: "Rounded",
  texture: "Natural",
  shotType: "Full face",
  faceShape: "Auto",
  character: "Balanced",
  // On by default: matching Case Library references are sent only when the
  // clinician has added cases (with authority confirmed) and one matches.
  libraryStyle: true,
  intensity: 35,
  notes: "",
};
