import type { GenerationResult } from "./types";
export async function downloadPreview(result: GenerationResult) {
  const img = new Image();
  img.src = result.image;
  await img.decode();
  const canvas = document.createElement("canvas");
  const width = Math.max(1000, img.naturalWidth);
  const photoHeight = Math.round(
    (img.naturalHeight * width) / img.naturalWidth,
  );
  const footer = Math.round(width * 0.12);
  canvas.width = width;
  canvas.height = photoHeight + footer;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Saving is not available in this browser.");
  ctx.drawImage(img, 0, 0, width, photoHeight);
  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, photoHeight, width, footer);
  ctx.fillStyle = "#252622";
  ctx.font = `500 ${Math.round(width * 0.02)}px -apple-system, sans-serif`;
  ctx.fillText(
    result.mode === "mock"
      ? "SMILE · DEMO — ORIGINAL PHOTO UNCHANGED"
      : "SMILE · DIGITAL SMILE SIMULATION",
    width * 0.035,
    photoHeight + footer * 0.3,
  );
  ctx.fillStyle = "#6d7068";
  ctx.font = `${Math.round(width * 0.012)}px -apple-system, sans-serif`;
  ctx.fillText(
    "For visual communication only. The final clinical result may differ following assessment,",
    width * 0.035,
    photoHeight + footer * 0.56,
  );
  ctx.fillText(
    "treatment planning and material selection.",
    width * 0.035,
    photoHeight + footer * 0.76,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not save image."))),
      "image/jpeg",
      0.95,
    ),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `smile-${result.mode === "mock" ? "demo" : "preview"}-${new Date().toISOString().slice(0, 10)}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
