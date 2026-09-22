import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Point } from "./geometry";

/**
 * On-device face landmarks (MediaPipe Face Landmarker). Runs entirely in the
 * browser: the patient's photo is never sent anywhere for this. Only the
 * model and its runtime are downloaded, once, and then cached by the browser.
 */
const VERSION = "1.0.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker: Promise<FaceLandmarker> | null = null;

function load(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })();
    // A failed download (offline, blocked network) must not stick: let the
    // next call try again.
    landmarker.catch(() => {
      landmarker = null;
    });
  }
  return landmarker;
}

/** Start fetching the model early so the first result isn't kept waiting. */
export function warmFaceModel(): void {
  void load().catch(() => {});
}

const cache = new Map<string, Promise<Point[] | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/**
 * Face landmarks in the image's own pixel coordinates, or null when no face
 * is found (e.g. a retracted close-up) or the model can't load.
 */
export function detectFace(src: string): Promise<Point[] | null> {
  const hit = cache.get(src);
  if (hit) return hit;
  const job = (async () => {
    try {
      const [model, img] = await Promise.all([load(), loadImage(src)]);
      const found = model.detect(img).faceLandmarks[0];
      if (!found || found.length < 468) return null;
      const w = img.naturalWidth, h = img.naturalHeight;
      return found.map((p) => [p.x * w, p.y * h] as Point);
    } catch {
      return null;
    }
  })();
  cache.set(src, job);
  // Photos are large data URLs; keep only the last few.
  while (cache.size > 6) cache.delete(cache.keys().next().value!);
  job.then((r) => {
    if (r === null) cache.delete(src);
  });
  return job;
}
