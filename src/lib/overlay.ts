/**
 * Superimposed outline of the proposed change.
 *
 * This is derived from the two photographs only — the original and the
 * generated preview, which are pixel-aligned by alignPreview. It is not a
 * segmentation of teeth and not a wax-up: it shows where the preview differs
 * from the photograph, and the edges of the proposed result inside that area.
 */

export interface OutlineOptions {
  /** Luminance difference that counts as changed, 0-255. */
  changeThreshold?: number;
  /** Sobel gradient that counts as an edge, 0-255. */
  edgeThreshold?: number;
  /** Longest side of the working canvas. Smaller is faster, softer. */
  maxSize?: number;
}

const LUM = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

async function draw(src: string, w: number, h: number): Promise<ImageData> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser could not prepare the overlay.");
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function luminance(data: ImageData): Float32Array {
  const out = new Float32Array(data.width * data.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4)
    out[i] = LUM(data.data[p], data.data[p + 1], data.data[p + 2]);
  return out;
}

/** Grow a mask by `radius` pixels so thin changes keep their edges. */
export function dilate(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
): Uint8Array {
  let src = mask;
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) {
          next[i] = 1;
          continue;
        }
        if (
          (x > 0 && src[i - 1]) ||
          (x < w - 1 && src[i + 1]) ||
          (y > 0 && src[i - w]) ||
          (y < h - 1 && src[i + w])
        )
          next[i] = 1;
      }
    src = next;
  }
  return src;
}

/** Shrink a mask by `radius` pixels. Paired with dilate this is an opening. */
export function erode(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
): Uint8Array {
  let src = mask;
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!src[i]) continue;
        const up = y > 0 ? src[i - w] : 0;
        const down = y < h - 1 ? src[i + w] : 0;
        const left = x > 0 ? src[i - 1] : 0;
        const right = x < w - 1 ? src[i + 1] : 0;
        if (up && down && left && right) next[i] = 1;
      }
    src = next;
  }
  return src;
}

/**
 * Keep only blobs of at least `minArea` pixels. A preview is one contiguous
 * area of change; hair, stubble and recompression noise are scattered specks.
 */
export function keepLargeRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
): Uint8Array {
  const out = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const blob: number[] = [];
    while (stack.length) {
      const i = stack.pop() as number;
      blob.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (blob.length >= minArea) for (const i of blob) out[i] = 1;
  }
  return out;
}

export function sobel(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(lum.length);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = lum[i - w - 1], b = lum[i - w], c = lum[i - w + 1];
      const d = lum[i - 1], f = lum[i + 1];
      const g = lum[i + w - 1], hh = lum[i + w], k = lum[i + w + 1];
      const gx = a + 2 * d + g - (c + 2 * f + k);
      const gy = a + 2 * b + c - (g + 2 * hh + k);
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  return out;
}

/**
 * Returns a transparent PNG the size of the working canvas: the proposed
 * result's edges drawn solid, and the boundary of the changed area drawn
 * faintly around them. Returns null when nothing changed enough to outline,
 * so the caller can say so rather than showing an empty overlay.
 */
export async function buildChangeOutline(
  original: string,
  preview: string,
  options: OutlineOptions = {},
): Promise<string | null> {
  const {
    changeThreshold = 18,
    edgeThreshold = 34,
    maxSize = 1100,
  } = options;

  const probe = new Image();
  probe.src = preview;
  await probe.decode();
  const scale = Math.min(
    1,
    maxSize / Math.max(probe.naturalWidth, probe.naturalHeight),
  );
  const w = Math.max(1, Math.round(probe.naturalWidth * scale));
  const h = Math.max(1, Math.round(probe.naturalHeight * scale));

  const [before, after] = await Promise.all([
    draw(original, w, h),
    draw(preview, w, h),
  ]);
  const lumBefore = luminance(before);
  const lumAfter = luminance(after);

  // Where the preview actually differs from the photograph.
  const changed = new Uint8Array(w * h);
  let changedCount = 0;
  for (let i = 0; i < changed.length; i++) {
    const p = i * 4;
    const delta = Math.max(
      Math.abs(lumAfter[i] - lumBefore[i]),
      Math.abs(after.data[p] - before.data[p]),
      Math.abs(after.data[p + 1] - before.data[p + 1]),
      Math.abs(after.data[p + 2] - before.data[p + 2]),
    );
    if (delta > changeThreshold) {
      changed[i] = 1;
      changedCount++;
    }
  }
  // A handful of stray pixels is noise, not a design.
  if (changedCount < w * h * 0.0008) return null;

  // An opening drops hair strands, stubble and recompression speckle; the
  // component filter then drops anything too small to be a smile design.
  const opened = dilate(erode(changed, w, h, 1), w, h, 2);
  const solid = keepLargeRegions(
    opened,
    w,
    h,
    Math.max(80, Math.round(w * h * 0.0012)),
  );
  if (!solid.some(Boolean)) return null;
  const region = dilate(solid, w, h, 2);
  const edges = sobel(lumAfter, w, h);

  // The outer boundary of the changed area, for context around the edges.
  const boundary = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!region[i]) continue;
      if (
        !region[i - 1] ||
        !region[i + 1] ||
        !region[i - w] ||
        !region[i + w]
      )
        boundary[i] = 1;
    }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the overlay.");
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < region.length; i++) {
    const p = i * 4;
    if (region[i] && edges[i] > edgeThreshold) {
      // Proposed edges: incisal edges, line angles, interproximal contacts.
      const strength = Math.min(1, (edges[i] - edgeThreshold) / 60);
      out.data[p] = 60;
      out.data[p + 1] = 224;
      out.data[p + 2] = 255;
      out.data[p + 3] = Math.round(140 + 115 * strength);
    } else if (boundary[i]) {
      out.data[p] = 60;
      out.data[p + 1] = 224;
      out.data[p + 2] = 255;
      out.data[p + 3] = 70;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}
