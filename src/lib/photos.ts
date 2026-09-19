import type { Photo } from "./types";
import { assessPhotoQuality } from "./photoQuality";
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
      const { heicTo } = await import("heic-to");
      blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.94 });
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

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.93),
      name: file.name,
      width: canvas.width,
      height: canvas.height,
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

/** Compensate only for the provider's 16px size rounding; never stretch a reframed face. */
export async function alignPreview(
  dataUrl: string,
  original: Photo,
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const difference = Math.abs(
    image.naturalWidth /
      image.naturalHeight /
      (original.width / original.height) -
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
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.95);
}
