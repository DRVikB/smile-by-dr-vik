import { imageDimensions } from "./openai";

/**
 * A blank canvas compresses to almost nothing: measured at about 0.016 bytes
 * per pixel as JPEG and 0.005 as PNG, against at least 0.05 (JPEG, even a
 * heavily blurred portrait) and 0.6 (PNG) for a real photograph. Sending a
 * blank picture makes an image service invent a person, so refuse it before
 * any generation is reserved.
 */
export const MIN_JPEG_BYTES_PER_PIXEL = 0.03;
export const MIN_PNG_BYTES_PER_PIXEL = 0.1;

export function sourceLooksBlank(dataUrl: string): boolean {
  const [prefix, encoded = ""] = dataUrl.split(",");
  const png = prefix.includes("image/png");
  const bytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  let pixels: number;
  try {
    const head = Uint8Array.from(atob(encoded.slice(0, png ? 44 : 87_380)), c => c.charCodeAt(0));
    const { width, height } = imageDimensions(head, png ? "image/png" : "image/jpeg");
    pixels = width * height;
  } catch { return false; }
  return pixels > 0 && bytes / pixels < (png ? MIN_PNG_BYTES_PER_PIXEL : MIN_JPEG_BYTES_PER_PIXEL);
}
