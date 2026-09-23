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
  source.data.set(compositeEditMask(source.data, generated.data, area.data));
  ctx.putImageData(source, 0, 0);
  // Restore original content outside the mask before the usual JPEG encoding.
  return canvas.toDataURL("image/jpeg", 0.95);
}
