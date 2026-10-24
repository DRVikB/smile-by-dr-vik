/** Small JPEG preview so the case log list stays fast with many entries. */
export async function thumbnail(
  dataUrl: string,
  size = 360,
  quality = 0.72,
): Promise<string> {
  try {
    // Decode off screen first: an <img> decode can wait for rendering, which a hidden page never does.
    const offscreen = await decodeOffscreen(dataUrl);
    const first = offscreen ? draw(offscreen, size, quality) : null;
    // Read back before the bitmap is released (Safari can otherwise hand back a black canvas), and if it still came
    // out blank, decode the ordinary way.
    if (first && !first.blank) return first.url;
    const again = draw(await decodeImage(dataUrl), size, quality);
    return again && !again.blank ? again.url : dataUrl;
  } catch {
    return dataUrl;
  }
}

function draw(source: Decoded, size: number, quality: number): { url: string; blank: boolean } | null {
  const scale = Math.min(1, size / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) { source.close?.(); return null; }
  ctx.drawImage(source.image, 0, 0, w, h);
  const url = canvas.toDataURL("image/jpeg", quality);
  let blank = true;
  try {
    const px = ctx.getImageData(0, 0, w, h).data, step = Math.max(4, Math.floor(px.length / 4 / 400) * 4);
    for (let i = 0; i < px.length; i += step) if (px[i] + px[i + 1] + px[i + 2] > 24) { blank = false; break; }
  } catch { blank = false; }
  source.close?.();
  return { url, blank };
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
