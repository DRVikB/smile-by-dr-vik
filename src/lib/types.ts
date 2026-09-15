export type Screen = "start" | "design" | "preview";
export type TeethCount = 4 | 6 | 8 | 10;
export type Treatment = "Composite" | "Porcelain";
export type CurrentShade = "A3" | "A2" | "A1" | "B1";
export type TargetShade = "A1" | "B1" | "BL3" | "BL2" | "BL1";
export type ToothShape = "Rounded" | "Soft Square" | "Square";
export interface SmileSettings {
  teeth: TeethCount;
  selectedTeeth: number[];
  treatment: Treatment;
  currentShade: CurrentShade;
  targetShade: TargetShade;
  shape: ToothShape;
  intensity: number;
}
export interface Photo {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  isSample?: boolean;
}
export interface GenerationResult {
  image: string;
  mode: "mock" | "live";
  variationId: string;
}
export interface SmileCase {
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
  targetShade: "B1",
  shape: "Soft Square",
  intensity: 35,
};
