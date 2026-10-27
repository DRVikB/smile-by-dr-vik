import type { Point } from "./face/geometry";
import type { ShotType } from "./types";

/**
 * Whether a photo shows the whole face or is a smile close-up, from the on-device face landmarks.
 * A full-face photo has both eyes inside the picture and a mouth well under half its width; a close-up
 * (lips, teeth, perhaps the nose) either has no face found at all or a face that runs off the frame —
 * the landmark model still places eyes it cannot see, outside the picture.
 */
export function shotTypeFromLandmarks(points: readonly Point[] | null, width: number, height: number): ShotType {
  if (!points || points.length < 468 || !(width > 0) || !(height > 0)) return "Close-up";
  const inside = (i: number) => {
    const p = points[i];
    return !!p && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
  };
  // Outer eye corners, the bridge of the nose and the chin all in the picture.
  if (![33, 263, 168, 152].every(inside)) return "Close-up";
  const mouth = Math.hypot(points[291][0] - points[61][0], points[291][1] - points[61][1]);
  return mouth / width < 0.45 ? "Full face" : "Close-up";
}

/** The photo type for a newly chosen photo; undefined when it can't be told (the current setting then stays). */
export async function detectShotType(photo: { dataUrl: string; width: number; height: number }, signal?: AbortSignal): Promise<ShotType | undefined> {
  const { detectFaceDetailed } = await import("./face/landmarks");
  const result = await detectFaceDetailed(photo.dataUrl, signal);
  // A model or decoding failure says nothing about the photo; only "no face found" means a close-up.
  if (!result.points && result.failure && result.failure !== "generated_face_not_found") return undefined;
  return shotTypeFromLandmarks(result.points, photo.width, photo.height);
}
