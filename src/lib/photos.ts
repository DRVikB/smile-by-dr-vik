import type { Framing, Photo } from "./types";
import { releaseCanvas } from "./canvasMemory";
import { assessPhotoQuality } from "./photoQuality";
import { frameWithinCanvas, generationCanvas } from "./generationCanvas";
import type { RawOutputDiagnostic, OutputGeometryDiagnostic } from "./face/alignmentDiagnostic";
import { dataUrlOrientation } from "./face/rawOutputMetadata";
export async function preparePhoto(file: File): Promise<Photo> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 25 MB.");
  const heic =
    /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
  if (!heic && !["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Please choose a JPG, PNG or HEIC photo.");
  let blob: Blob = file;
  if (heic) {
    try {
      const { heicToJpeg } = await import("./heic");
      blob = await heicToJpeg(file);
    } catch {
      throw new Error(
        "This HEIC photo could not be opened. Please export it as JPG and try again.",
      );
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (Math.min(image.naturalWidth, image.naturalHeight) < 200)
      throw new Error("Use a larger photo, at least 200 pixels on each side.");
    const scale = Math.min(
      1,
      2048 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare the photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // A cheap, small-scale pass is enough to judge sharpness and exposure —
    // no need to analyse the full-resolution photo for this.
    const qScale = Math.min(1, 240 / Math.max(canvas.width, canvas.height));
    const qWidth = Math.max(1, Math.round(canvas.width * qScale));
    const qHeight = Math.max(1, Math.round(canvas.height * qScale));
    const qCanvas = document.createElement("canvas");
    qCanvas.width = qWidth;
    qCanvas.height = qHeight;
    const qCtx = qCanvas.getContext("2d", { willReadFrequently: true });
    const quality = qCtx
      ? (() => {
          qCtx.drawImage(canvas, 0, 0, qWidth, qHeight);
          const { data } = qCtx.getImageData(0, 0, qWidth, qHeight);
          return assessPhotoQuality(data, qWidth, qHeight);
        })()
      : undefined;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.93);
    const { width, height } = canvas;
    releaseCanvas(canvas, qCanvas);
    if (process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE === "1") {
      const { registerSyntheticQaPhoto } = await import("@/services/ai/syntheticQaCapture");
      await registerSyntheticQaPhoto(file, dataUrl);
    }
    return {
      dataUrl,
      name: file.name,
      width,
      height,
      quality,
    };
  } catch (error) {
    throw error instanceof Error && error.message.startsWith("Use a larger")
      ? error
      : new Error("This photo could not be opened. Please try another image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const validSize = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;

/** A photo saved without its pixel size (one build stored 0×0) gets it back from the image. */
export async function ensurePhotoDimensions<T extends Pick<Photo, "dataUrl" | "width" | "height">>(photo: T): Promise<T> {
  if (validSize(photo.width) && validSize(photo.height)) return photo;
  const image = new Image();
  image.src = photo.dataUrl;
  await image.decode();
  return { ...photo, width: image.naturalWidth, height: image.naturalHeight };
}

/** Temporary provider-compatible canvas. The saved original stays untouched. */
export async function prepareGenerationPhoto(original: Photo): Promise<{ photo: Photo; sourceBounds: Framing }> {
  const layout = generationCanvas(original.width, original.height);
  const source = layout.sourceBounds;
  if (layout.width === original.width && layout.height === original.height && source.x === 0 && source.y === 0 && source.width === 1 && source.height === 1)
    return { photo: original, sourceBounds: source };
  const image = new Image();
  image.src = original.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = layout.width; canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The photo could not be prepared for generation.");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, source.x * canvas.width, source.y * canvas.height, source.width * canvas.width, source.height * canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95), width = canvas.width, height = canvas.height;
  releaseCanvas(canvas);
  return { sourceBounds: source, photo: { ...original,
    dataUrl, width, height,
    framing: original.framing ? frameWithinCanvas(original.framing, source) : undefined,
  } };
}

/** Undo known request padding and small provider rounding; reject reframed output. */
export async function alignPreview(
  dataUrl: string,
  original: Photo,
  requestCanvas?: { photo: Photo; sourceBounds: Framing },
  reportRaw?: (metadata: RawOutputDiagnostic) => void,
  reportGeometry?: (metadata: OutputGeometryDiagnostic) => void,
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (reportRaw) {
    const mime = dataUrl.startsWith("data:image/jpeg;base64,") ? "image/jpeg"
      : dataUrl.startsWith("data:image/png;base64,") ? "image/png" : null;
    if (mime) try { reportRaw({ width: image.naturalWidth, height: image.naturalHeight, mime, exifOrientation: dataUrlOrientation(dataUrl) }); }
    catch { /* Optional QA must never alter validation or delivery. */ }
  }
  const difference = Math.abs(
    image.naturalWidth /
      image.naturalHeight /
      ((requestCanvas?.photo.width ?? original.width) / (requestCanvas?.photo.height ?? original.height)) -
      1,
  );
  if (difference > 0.03)
    throw new Error(
      "The preview changed the photograph’s framing. Please regenerate to keep the comparison aligned.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = original.width;
  canvas.height = original.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The preview could not be prepared.");
  const source = requestCanvas?.sourceBounds ?? { x: 0, y: 0, width: 1, height: 1 };
  ctx.drawImage(image, source.x * image.naturalWidth, source.y * image.naturalHeight,
    source.width * image.naturalWidth, source.height * image.naturalHeight,
    0, 0, canvas.width, canvas.height);
  try { reportGeometry?.({ cropX: source.x * image.naturalWidth, cropY: source.y * image.naturalHeight,
    cropWidth: source.width * image.naturalWidth, cropHeight: source.height * image.naturalHeight,
    finalWidth: canvas.width, finalHeight: canvas.height, scaleX: canvas.width / (source.width * image.naturalWidth), scaleY: canvas.height / (source.height * image.naturalHeight) }); } catch { /* Diagnostics cannot alter delivery. */ }
  const aligned = canvas.toDataURL("image/jpeg", 0.95);
  releaseCanvas(canvas);
  return aligned;
}
