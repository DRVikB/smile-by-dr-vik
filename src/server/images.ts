import { imageDimensions } from "@/lib/generation/openai";

/** A validated JPEG from a data URL. Only JPEG is accepted for stored account media. */
export interface DecodedImage { bytes: Uint8Array; width: number; height: number; contentType: "image/jpeg" }

export function decodeJpegDataUrl(value: unknown, maxBytes: number, maxEdge = 4096): DecodedImage | null {
  if (typeof value !== "string" || !value.startsWith("data:image/jpeg;base64,")) return null;
  const encoded = value.slice("data:image/jpeg;base64,".length);
  if (!encoded || encoded.length > Math.ceil(maxBytes / 3) * 4 + 4 || /[^A-Za-z0-9+/=]/.test(encoded)) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length > maxBytes) return null;
  try {
    const { width, height } = imageDimensions(bytes, "image/jpeg");
    if (width > maxEdge || height > maxEdge) return null;
    return { bytes, width, height, contentType: "image/jpeg" };
  } catch {
    return null;
  }
}

export function toJpegDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
