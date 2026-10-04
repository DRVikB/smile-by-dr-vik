/**
 * iOS WebKit caps the total memory of a page's canvases. Past the cap, new
 * canvases silently stay blank: a photo drawn into one disappears, and a blank
 * picture sent to an image service comes back as an invented person. Free each
 * full-size canvas as soon as its pixels have been read or exported.
 */
export function releaseCanvas(...canvases: (HTMLCanvasElement | null | undefined)[]): void {
  for (const canvas of canvases) if (canvas) { canvas.width = 0; canvas.height = 0; }
}

async function bitmap(src: string): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(await (await fetch(src)).blob()); }
  catch {
    const image = new Image(); image.src = src; await image.decode(); return image;
  }
}

/**
 * Whether `candidate` (within `bounds`, a normalised region of it) shows the
 * same picture as `original`: compared small, by brightness pattern. A blank or
 * different image fails.
 */
export async function sameImageContent(original: string, candidate: string, bounds = { x: 0, y: 0, width: 1, height: 1 }): Promise<boolean> {
  const [a, b] = await Promise.all([bitmap(original), bitmap(candidate)]);
  const aw = "naturalWidth" in a ? a.naturalWidth : a.width, ah = "naturalHeight" in a ? a.naturalHeight : a.height;
  const bw = "naturalWidth" in b ? b.naturalWidth : b.width, bh = "naturalHeight" in b ? b.naturalHeight : b.height;
  const W = 48, H = Math.max(8, Math.round(48 * ah / aw));
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true; // Nothing to compare with; the server check still applies.
  try {
    ctx.drawImage(a, 0, 0, W, H);
    const A = ctx.getImageData(0, 0, W, H).data;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(b, bounds.x * bw, bounds.y * bh, bounds.width * bw, bounds.height * bh, 0, 0, W, H);
    const B = ctx.getImageData(0, 0, W, H).data;
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let p = 0; p < A.length; p += 4) {
      const va = 0.299 * A[p] + 0.587 * A[p + 1] + 0.114 * A[p + 2], vb = 0.299 * B[p] + 0.587 * B[p + 1] + 0.114 * B[p + 2];
      n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
    const varA = saa / n - (sa / n) ** 2, varB = sbb / n - (sb / n) ** 2;
    if (varB < 9) return varA < 9; // Blank candidate: only a blank original matches.
    return (sab / n - (sa / n) * (sb / n)) / Math.sqrt(varA * varB) > 0.9;
  } finally {
    releaseCanvas(canvas);
    if ("close" in a) a.close();
    if ("close" in b) b.close();
  }
}
