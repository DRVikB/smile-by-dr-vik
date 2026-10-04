import { OUTER_LIP, STABLE_POINTS, type Point } from "./face/geometry";
import type { Framing } from "./types";

/** What a photograph may carry that says where the smile is. */
export interface FocusSource {
  analysisSnapshot?: { width: number; height: number; landmarks: Point[] };
  framing?: Framing;
  width?: number;
  height?: number;
}

function boundsOf(points: Point[], width: number, height: number): Framing | null {
  const valid = points.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!valid.length || !(width > 0) || !(height > 0)) return null;
  const xs = valid.map(p => p[0] / width), ys = valid.map(p => p[1] / height);
  const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
  const box = { x, y, width: Math.min(1, Math.max(...xs)) - x, height: Math.min(1, Math.max(...ys)) - y };
  return box.width > 0 && box.height > 0 ? box : null;
}

function landmarkRegion(source: FocusSource | undefined, indices: readonly number[]): Framing | null {
  const s = source?.analysisSnapshot;
  if (!s || !Array.isArray(s.landmarks) || s.landmarks.length < 468) return null;
  // Landmarks found on a differently shaped image belong to another photograph.
  if (source?.width && source.height && Math.abs(s.width / s.height - source.width / source.height) > 0.02) return null;
  return boundsOf(indices.map(i => s.landmarks[i]).filter(Boolean), s.width, s.height);
}

/** Without landmarks: a portrait photo is a face (smile in the lower middle); anything wider is a close-up. */
function assumedSmile(source: FocusSource | undefined): Framing {
  const portrait = (source?.height ?? 0) > (source?.width ?? 0) * 1.15;
  return portrait ? { x: 0.28, y: 0.42, width: 0.44, height: 0.3 } : { x: 0.12, y: 0.26, width: 0.76, height: 0.48 };
}

/** The smile as the photo records it: the lips found on it, else the capture guide. Null when unknown. */
export function knownSmileRegion(source?: FocusSource): Framing | null {
  return landmarkRegion(source, OUTER_LIP) ?? source?.framing ?? null;
}

/** The smile: as recorded, else where a smile usually is. */
export function smileRegion(source?: FocusSource): Framing {
  return knownSmileRegion(source) ?? assumedSmile(source);
}

/** For smile analysis the eyes matter too: lips and eye line together. */
export function analysisRegion(source?: FocusSource): Framing {
  const found = landmarkRegion(source, [...OUTER_LIP, ...STABLE_POINTS]);
  if (found) return found;
  const smile = smileRegion(source);
  const portrait = (source?.height ?? 0) > (source?.width ?? 0) * 1.15;
  if (!portrait) return smile;
  const top = Math.max(0, smile.y - 0.2);
  return { x: Math.min(smile.x, 0.25), y: top, width: Math.max(smile.width, 0.5), height: smile.y + smile.height - top };
}
