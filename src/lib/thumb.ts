/** Small JPEG preview so the case log list stays fast with many entries. */
export async function thumbnail(
  dataUrl: string,
  size = 360,
  quality = 0.72,
): Promise<string> {
  try {
    // Decode off screen first: an <img> decode can wait for rendering, which a hidden page never does.
    const source = await decodeOffscreen(dataUrl) ?? await decodeImage(dataUrl);
    const scale = Math.min(1, size / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(source.image, 0, 0, w, h);
    source.close?.();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

type Decoded = { image: CanvasImageSource; width: number; height: number; close?: () => void };

async function decodeOffscreen(dataUrl: string): Promise<Decoded | null> {
  if (typeof createImageBitmap !== "function") return null;
  const match = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: match[1] }));
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    return null;
  }
}

async function decodeImage(dataUrl: string): Promise<Decoded> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { image: img, width: img.naturalWidth, height: img.naturalHeight };
}
