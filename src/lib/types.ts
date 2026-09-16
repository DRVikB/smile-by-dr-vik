export type Screen = "start" | "design" | "compare" | "preview";
export type TeethCount = 4 | 6 | 8 | 10;
export type Treatment = "Composite" | "Porcelain";
export type CurrentShade = "A3" | "A2" | "A1" | "B1";
export type TargetShade = "The same" | "Whiten" | "Bleach" | "A1" | "B1" | "BL3" | "BL2" | "BL1";
export type ToothShape = "Square" | "Rounded" | "Triangular";
export type TextureLevel = "Smooth" | "Natural" | "Textured";
export type ShotType = "Full face" | "Close-up";
export interface SmileSettings {
  teeth: TeethCount;
  selectedTeeth: number[];
  treatment: Treatment;
  currentShade: CurrentShade;
  targetShade: TargetShade;
  shape: ToothShape;
  texture: TextureLevel;
  shotType: ShotType;
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
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  isSample?: boolean;
  framing?: Framing;
}
export interface PreviewPreferences {
  settings: SmileSettings;
  referenceUsed?: boolean;
  testMode?: boolean;
}
export interface GenerationResult {
  preferences?: PreviewPreferences;
  image: string;
  mode: "mock" | "live";
  variationId: string;
}
export interface SmileVariant {
  label: string;
  note: string;
  patch: Partial<SmileSettings>;
  settings: SmileSettings;
  result: GenerationResult;
}
export interface CaseLogEntry {
  id: string;
  patientName: string;
  createdAt: number;
  mode: "mock" | "live";
  testMode?: boolean;
  label?: string;
  summary: string;
  thumb: string;
}
export interface CaseLogMedia {
  id: string;
  image: string;
  originalImage: string;
}
export interface SmileCase {
  patientName?: string;
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
  treatment: "Composite",
  currentShade: "A2",
  targetShade: "Whiten",
  shape: "Rounded",
  texture: "Natural",
  shotType: "Full face",
  intensity: 35,
  notes: "",
};
