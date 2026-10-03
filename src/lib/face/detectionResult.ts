import type { Point } from "./geometry";

export const FACE_DETECTION_FAILURES = ["generated_face_not_found", "generated_image_decode_failed", "generated_face_worker_failed", "generated_face_model_failed", "generated_landmarks_invalid", "generated_landmarks_missing"] as const;
export type FaceDetectionFailure = typeof FACE_DETECTION_FAILURES[number];
export interface FaceDetectionResult { points: Point[] | null; failure?: FaceDetectionFailure }

/** Inference boundary: categorise by the operation that failed, never its exception text. */
export async function runFaceDetection<M, I extends { close(): void }>(src: string, operations: {
  load(): Promise<M>; decode(src: string): Promise<I>; detect(model: M, image: I): unknown;
}): Promise<FaceDetectionResult> {
  let model: M;
  try { model = await operations.load(); } catch { return { points: null, failure: "generated_face_model_failed" }; }
  let image: I;
  try { image = await operations.decode(src); } catch { return { points: null, failure: "generated_image_decode_failed" }; }
  try {
    let points: unknown;
    try { points = operations.detect(model, image); } catch { return { points: null, failure: "generated_face_model_failed" }; }
    if (points === undefined || points === null) return { points: null, failure: "generated_landmarks_missing" };
    if (Array.isArray(points) && points.length === 0) return { points: null, failure: "generated_face_not_found" };
    if (!Array.isArray(points) || points.length < 468 || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
      return { points: null, failure: "generated_landmarks_invalid" };
    return { points: points as Point[] };
  } finally { image.close(); }
}
