import { wrapText } from "./report";

/**
 * Shared drawing for the patient exports. Both are drawn on ivory with fixed
 * colours, so they are always light and presentation-ready whatever the app's
 * own appearance.
 */
export const PAPER = {
  ground: "#FAF8F4",
  ink: "#2A2622",
  body: "#4A433C",
  muted: "#786E63",
  faint: "#A1978C",
  rule: "rgba(42, 38, 34, 0.12)",
  champagne: "#B08E5A",
  champagneSoft: "#E9DCC6",
  photo: "#EFEAE2",
} as const;

export const serif = (px: number, weight = 400) =>
  `${weight} ${px}px "New York", "Iowan Old Style", Georgia, "Times New Roman", serif`;
export const sans = (px: number, weight = 400) =>
  `${weight} ${px}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

export interface Box { x: number; y: number; w: number; h: number }

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

export function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device couldn’t prepare the export.");
  ctx.fillStyle = PAPER.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  return { canvas, ctx };
}

export function roundedPath(ctx: CanvasRenderingContext2D, b: Box, r: number) {
  ctx.beginPath();
  ctx.moveTo(b.x + r, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  ctx.closePath();
}

/**
 * The whole photograph, never cropped, centred in its cell with rounded
 * corners. Returns where it landed so captions and tags hug the photo.
 */
export function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cell: Box, radius: number): Box {
  const scale = Math.min(cell.w / img.naturalWidth, cell.h / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  const box = { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
  ctx.save();
  roundedPath(ctx, box, radius);
  ctx.clip();
  ctx.fillStyle = PAPER.photo;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.drawImage(img, box.x, box.y, box.w, box.h);
  ctx.restore();
  return box;
}

/** "BEFORE" / "CONCEPT": small, letter-spaced. */
export function caption(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, colour: string, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.font = sans(px, 600);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.letterSpacing = `${Math.round(px * 0.28)}px`;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

/** Wrapped text; returns the height used. */
export function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, font: string, colour: string, lineHeight: number): number {
  ctx.font = font;
  ctx.fillStyle = colour;
  const lines = wrapText(ctx, text, width);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

export function measureParagraph(ctx: CanvasRenderingContext2D, text: string, width: number, font: string, lineHeight: number): number {
  ctx.font = font;
  return wrapText(ctx, text, width).length * lineHeight;
}

export function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, colour: string = PAPER.rule, thickness = 1.5) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, thickness);
}

export function toJpeg(canvas: HTMLCanvasElement, quality = 0.93): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("The export couldn’t be saved."))), "image/jpeg", quality));
}

/** A PNG copy (the clipboard only takes PNG). */
export async function toPng(jpeg: Blob): Promise<Blob> {
  const url = URL.createObjectURL(jpeg);
  try {
    const img = await loadImage(url);
    const { canvas, ctx } = canvasOf(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("The image couldn’t be copied."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pages one above the other, for sharing a multi-page export as a single image. */
export async function stackPages(pages: Blob[], gap: number): Promise<Blob> {
  const urls = pages.map(p => URL.createObjectURL(p));
  try {
    const images = await Promise.all(urls.map(loadImage));
    const width = Math.max(...images.map(i => i.naturalWidth));
    const height = images.reduce((sum, i) => sum + i.naturalHeight, 0) + gap * (images.length - 1);
    const { canvas, ctx } = canvasOf(width, height);
    ctx.fillStyle = "#E7E1D8";
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    for (const img of images) {
      ctx.drawImage(img, 0, y);
      y += img.naturalHeight + gap;
    }
    return await toJpeg(canvas, 0.9);
  } finally {
    urls.forEach(u => URL.revokeObjectURL(u));
  }
}
