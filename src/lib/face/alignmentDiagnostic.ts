/** Private QA metadata only; no points, images, text or patient identifiers. */
import { FACE_DETECTION_FAILURES, type FaceDetectionFailure } from "./detectionResult";
export const ALIGNMENT_REJECTIONS = ["source_landmarks_missing", "source_landmarks_invalid", "generated_landmarks_missing", "generated_landmarks_invalid", "mouth_width_insufficient", "similarity_scale_out_of_range", "similarity_rotation_out_of_range", "anchor_residual_excessive", "anchor_outliers_excessive", "canvas_geometry_invalid"] as const;
export type AlignmentRejection = typeof ALIGNMENT_REJECTIONS[number];
export interface MouthAlignmentDiagnostic {
  generatedFaceFailure?: FaceDetectionFailure;
  rejection?: AlignmentRejection;
  sourceLandmarkCount?: number; generatedLandmarkCount?: number;
  sourceMouthWidth?: number; generatedMouthWidth?: number;
  fittedScale?: number; fittedRotationDegrees?: number;
  medianResidual?: number; allowedResidual?: number;
  anchorOutlierCount?: number; allowedOutlierCount?: number;
  sourceWidth?: number; sourceHeight?: number;
  generatedWidth?: number; generatedHeight?: number;
  protectedMeanDifference?: number; protectedChangedPixels?: number; editableRange?: number;
}
export interface RawOutputDiagnostic { width: number; height: number; mime: "image/jpeg" | "image/png"; exifOrientation: number | null }
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};
export function safeAlignmentDiagnostic(value: unknown): MouthAlignmentDiagnostic | undefined {
  const v = object(value), result: MouthAlignmentDiagnostic = {};
  if (FACE_DETECTION_FAILURES.includes(v.generatedFaceFailure as FaceDetectionFailure)) result.generatedFaceFailure = v.generatedFaceFailure as FaceDetectionFailure;
  if (ALIGNMENT_REJECTIONS.includes(v.rejection as AlignmentRejection)) result.rejection = v.rejection as AlignmentRejection;
  for (const key of ["sourceLandmarkCount", "generatedLandmarkCount", "anchorOutlierCount", "allowedOutlierCount", "sourceWidth", "sourceHeight", "generatedWidth", "generatedHeight", "protectedChangedPixels"] as const) {
    const n = v[key]; if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= (key === "protectedChangedPixels" ? 40000 * 40000 : 40000)) result[key] = n;
  }
  for (const key of ["sourceMouthWidth", "generatedMouthWidth", "fittedScale", "medianResidual", "allowedResidual", "fittedRotationDegrees"] as const) {
    const n = v[key]; if (typeof n === "number" && Number.isFinite(n) && n >= (key === "fittedRotationDegrees" ? -180 : 0) && n <= (key === "fittedRotationDegrees" ? 180 : 80000)) result[key] = n;
  }
  if (typeof v.protectedMeanDifference === "number" && Number.isFinite(v.protectedMeanDifference) && v.protectedMeanDifference >= 0 && v.protectedMeanDifference <= 1) result.protectedMeanDifference = v.protectedMeanDifference;
  if (typeof v.editableRange === "number" && Number.isFinite(v.editableRange) && v.editableRange >= 0 && v.editableRange <= 255) result.editableRange = v.editableRange;
  return Object.keys(result).length ? result : undefined;
}
export function safeRawOutputDiagnostic(value: unknown): RawOutputDiagnostic | undefined {
  const v = object(value);
  if (![v.width, v.height].every(n => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 40000) || !["image/jpeg", "image/png"].includes(String(v.mime))) return;
  return { width: v.width as number, height: v.height as number, mime: v.mime as RawOutputDiagnostic["mime"], exifOrientation: Number.isInteger(v.exifOrientation) && Number(v.exifOrientation) >= 1 && Number(v.exifOrientation) <= 8 ? Number(v.exifOrientation) : null };
}

/** Exact drawImage crop/scale from provider output to the saved source canvas. */
export interface OutputGeometryDiagnostic { cropX: number; cropY: number; cropWidth: number; cropHeight: number; finalWidth: number; finalHeight: number; scaleX: number; scaleY: number }
export function safeOutputGeometry(value: unknown): OutputGeometryDiagnostic | undefined {
  const v = object(value), result: Record<string, number> = {};
  for (const key of ["cropX", "cropY", "cropWidth", "cropHeight", "finalWidth", "finalHeight", "scaleX", "scaleY"] as const) {
    const n = v[key]; if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 40000 || ((key !== "cropX" && key !== "cropY") && n === 0)) return;
    if ((key === "finalWidth" || key === "finalHeight") && !Number.isInteger(n)) return;
    result[key] = n;
  }
  return result as unknown as OutputGeometryDiagnostic;
}
