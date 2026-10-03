import type { SmileSettings, ToothShape } from "./types";

const FORM: Record<ToothShape, string> = { Square: "square", Rounded: "rounded", Triangular: "tapered" };
const MATERIAL = {
  Composite: "single",
  "Single-shade composite": "single",
  "Layered composite": "layered",
  Porcelain: "porcelain",
} as const;

export const DEMO_PREVIEW_NOTICE = "Prepared AI concepts on the same demo face: three shapes, three materials, alignment and zirconia. No AI credits are used. Shade, tooth count, individual edits and fine adjustments are not simulated; hidden lower teeth remain hidden.";

/** Prepared examples only. Full-arch and alignment-only must win over stale material settings. */
export function demoPreviewAsset(settings: SmileSettings): { src: string; label: string } {
  if (settings.treatmentMode === "full_arch" && settings.fullArch) {
    if (settings.fullArch.arch === "lower") throw new Error("The demo photo does not show the lower teeth. Choose Upper or Both for the zirconia example.");
    if (settings.fullArch.restorationType !== "zirconia") throw new Error("Test mode has a prepared zirconia full-arch example. Choose Zirconia to view it; provisional restorations are not simulated.");
    return { src: `/demo-results/zirconia-${FORM[settings.shape]}-v1.webp`, label: `${settings.shape} · full-arch zirconia` };
  }
  if (settings.alignment?.only) {
    if (settings.alignment.arches === "Lower") throw new Error("The demo photo does not show the lower teeth. Choose Upper or Both for the alignment example.");
    return { src: "/demo-results/alignment-v1.webp", label: "Alignment only · original tooth shade and form" };
  }
  if (settings.treatment === "Whitening") throw new Error("A colour-only whitening example is not included in the prepared demo. Choose a material example, or use your own authorised photo for a whitening concept.");
  return { src: `/demo-results/${FORM[settings.shape]}-${MATERIAL[settings.treatment]}-v1.webp`, label: `${settings.shape} · ${settings.treatment === "Composite" ? "Single-shade composite" : settings.treatment}` };
}

/** Decode bundled WebP losslessly for comparison, without JPEG re-encoding dental details. */
export async function loadDemoPreview(settings: SmileSettings, signal?: AbortSignal): Promise<string> {
  const asset = demoPreviewAsset(settings);
  const response = await fetch(asset.src, { signal });
  if (!response.ok) throw new Error("This demo example couldn’t be loaded. Please try again.");
  const blob = await response.blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This device couldn’t prepare the demo photograph.");
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
