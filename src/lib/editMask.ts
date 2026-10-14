/** A clinician-painted permission mask. Only alpha authorises an edit.
 * It does not detect teeth or judge whether a painted area is appropriate.
 */
export function compositeEditMask(original: Uint8ClampedArray, edited: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
  if (original.length !== edited.length || original.length !== mask.length || original.length % 4 !== 0) throw new Error("Edit area dimensions do not match the photo.");
  const result = new Uint8ClampedArray(original);
  for (let i = 0; i < result.length; i += 4) {
    const alpha = mask[i + 3] / 255;
    for (let c = 0; c < 3; c++) result[i + c] = Math.round(original[i + c] * (1 - alpha) + edited[i + c] * alpha);
  }
  return result;
}
/** Fades a painted area in from its edge, never beyond it: a pixel's alpha falls
 * smoothly to nothing over `radius` px as it nears unpainted pixels. The image
 * service redraws neighbouring teeth, lips and the opposite arch a little
 * differently, so a full-strength edge leaves a straight cut through them;
 * faded, the result joins the photograph. Pixels outside the area stay exactly
 * original. Returns a new RGBA mask.
 */
export function featherEditMask(mask: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const n = width * height;
  if (mask.length !== n * 4) throw new Error("Edit area dimensions do not match the photo.");
  const out = new Uint8ClampedArray(mask);
  if (!(radius >= 1)) return out;
  // Two-pass chamfer distance (in px) to the nearest unpainted pixel.
  const d = new Float32Array(n), D = Math.SQRT2;
  for (let i = 0; i < n; i++) d[i] = mask[i * 4 + 3] === 0 ? 0 : radius;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; let v = d[i];
    if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - width] + 1); if (x > 0) v = Math.min(v, d[i - width - 1] + D); if (x < width - 1) v = Math.min(v, d[i - width + 1] + D); }
    d[i] = v;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x; let v = d[i];
    if (v === 0) continue;
    if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < height - 1) { v = Math.min(v, d[i + width] + 1); if (x < width - 1) v = Math.min(v, d[i + width + 1] + D); if (x > 0) v = Math.min(v, d[i + width - 1] + D); }
    d[i] = v;
  }
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, d[i] / radius), ease = t * t * (3 - 2 * t);
    out[i * 4 + 3] = Math.round(mask[i * 4 + 3] * ease);
  }
  return out;
}

/** How far a painted area fades in: a small share of its own width, so a mouth-only close-up and a painted area on a full face both join softly without fading whole teeth. */
export function editMaskFeather(mask: Uint8ClampedArray, width: number, height: number): number {
  let x0 = width, x1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[(y * width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return x1 < x0 ? 0 : Math.max(3, Math.round((x1 - x0 + 1) * 0.03));
}

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("The protected edit area could not be opened.")); image.src = src;
});
export async function protectOutsideEditMask(original: string, edited: string, mask: string): Promise<string> {
  const [o, e, m] = await Promise.all([load(original), load(edited), load(mask)]);
  const w = o.naturalWidth, h = o.naturalHeight;
  if (e.naturalWidth !== w || e.naturalHeight !== h || m.naturalWidth !== w || m.naturalHeight !== h) throw new Error("The edit area no longer matches this photo. Draw it again before generating.");
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Anatomy protection is unavailable on this device. Your original photo is safe.");
  const pixels = (image: HTMLImageElement) => { ctx.clearRect(0, 0, w, h); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, w, h); };
  const source = pixels(o), generated = pixels(e), area = pixels(m);
  if (!area.data.some((value, i) => i % 4 === 3 && value > 0)) throw new Error("The edit area is empty. Paint the selected teeth before generating.");
  const faded = featherEditMask(area.data, w, h, editMaskFeather(area.data, w, h));
  source.data.set(compositeEditMask(source.data, generated.data, faded));
  ctx.putImageData(source, 0, 0);
  // Keep restored anatomy lossless, including when this follows the face lock.
  return canvas.toDataURL("image/png");
}
