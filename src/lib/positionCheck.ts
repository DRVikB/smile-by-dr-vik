/**
 * A local, advisory check that veneers or bonding left the teeth where they are.
 *
 * Restorative work is done on the patient's own teeth: it cannot move the line between the two
 * central incisors or slide the row sideways. Image services sometimes do exactly that to make a
 * smile look more even. After a result is aligned to the photograph, the gaps between the teeth
 * show as dark dips in brightness across the changed part of the mouth; this compares where those
 * dips fall in the original and in the result, and reports a sideways shift when the two patterns
 * match best at an offset rather than in place.
 *
 * It says nothing when it cannot tell: too little changed, no clear pattern of gaps in either
 * image (heavily stained or worn teeth), or no offset that matches well.
 */

export interface PositionAssessment {
  flag: "ok" | "moved";
  /** Sideways shift of the gap pattern, as a share of the changed region's width (positive = to the right). */
  shiftRatio: number;
  /** How well the two patterns match at that shift (0–1), and in place. */
  match: number;
  matchInPlace: number;
}

const DIFF_THRESHOLD = 28;
const MIN_REGION = 40;

function changedBox(original: Uint8ClampedArray, generated: Uint8ClampedArray, w: number, h: number) {
  const columns = new Uint32Array(w), rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const diff = 0.299 * Math.abs(original[i] - generated[i]) + 0.587 * Math.abs(original[i + 1] - generated[i + 1]) + 0.114 * Math.abs(original[i + 2] - generated[i + 2]);
    if (diff > DIFF_THRESHOLD) { columns[x]++; rows[y]++; }
  }
  const span = (counts: Uint32Array, least: number) => { let a = -1, b = -1; for (let i = 0; i < counts.length; i++) if (counts[i] >= least) { if (a < 0) a = i; b = i; } return [a, b] as const; };
  const [x0, x1] = span(columns, Math.max(3, h * 0.004)), [y0, y1] = span(rows, Math.max(3, w * 0.004));
  return x0 < 0 || y0 < 0 ? null : { x0, x1, y0, y1 };
}

/** Brightness per column over the region, with the slow variation across the arch removed so only the gaps remain. */
function gapProfile(pixels: Uint8ClampedArray, w: number, box: { x0: number; x1: number; y0: number; y1: number }): Float64Array {
  const n = box.x1 - box.x0 + 1, raw = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    let sum = 0;
    for (let y = box.y0; y <= box.y1; y++) { const i = (y * w + box.x0 + x) * 4; sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]; }
    raw[x] = sum / (box.y1 - box.y0 + 1);
  }
  // About a tooth's width: a region holds some six to ten teeth.
  const r = Math.max(2, Math.round(n / 10)), out = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(n - 1, x + r); k++) { sum += raw[k]; count++; }
    out[x] = raw[x] - sum / count;
  }
  return out;
}

function matchAt(a: Float64Array, b: Float64Array, shift: number): number {
  // b shifted right by `shift` against a, over the columns both cover.
  let sab = 0, saa = 0, sbb = 0;
  for (let x = Math.max(0, shift); x < Math.min(a.length, b.length + shift); x++) { const p = a[x], q = b[x - shift]; sab += p * q; saa += p * p; sbb += q * q; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

export function assessToothPositions(original: Uint8ClampedArray, generated: Uint8ClampedArray, width: number, height: number): PositionAssessment | null {
  if (original.length !== generated.length || original.length < width * height * 4) return null;
  const box = changedBox(original, generated, width, height);
  if (!box || box.x1 - box.x0 < MIN_REGION || box.y1 - box.y0 < 8) return null;
  const before = gapProfile(original, width, box), after = gapProfile(generated, width, box);
  const strength = (p: Float64Array) => Math.sqrt(p.reduce((s, v) => s + v * v, 0) / p.length);
  // No clear gaps to compare (flat, stained or blurred teeth): say nothing.
  if (strength(before) < 3 || strength(after) < 3) return null;
  const n = before.length, reach = Math.round(n * 0.1);
  let best = 0, bestMatch = -1;
  // The result's pattern shifted by s lines up with the original's: the result's teeth sit s columns to the left of where they were, so report -s.
  for (let s = -reach; s <= reach; s++) { const m = matchAt(before, after, s); if (m > bestMatch) { bestMatch = m; best = s; } }
  const inPlace = matchAt(before, after, 0);
  const moved = bestMatch >= 0.5 && Math.abs(best) >= Math.max(3, n * 0.02) && bestMatch - inPlace >= 0.15;
  return { flag: moved ? "moved" : "ok", shiftRatio: -best / n, match: Math.max(0, bestMatch), matchInPlace: Math.max(0, inPlace) };
}

/** Decode two data URLs of the same size and run `assessToothPositions` on them. */
export async function assessToothPositionsFromDataUrls(originalDataUrl: string, generatedDataUrl: string): Promise<PositionAssessment | null> {
  try {
    const decode = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      return data;
    };
    const [a, b] = await Promise.all([decode(originalDataUrl), decode(generatedDataUrl)]);
    if (a.width !== b.width || a.height !== b.height) return null;
    return assessToothPositions(a.data, b.data, a.width, a.height);
  } catch { return null; }
}
