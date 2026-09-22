/**
 * Every exported "after" image carries this, burned into the pixels, so a
 * preview can't later be mistaken for a treatment result once it leaves the
 * surgery (ASA, May 2025: an AI image of a cosmetic effect must not stand in
 * for real results).
 */
export const AI_TAG = "AI illustration";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pill anchored inside the bottom-right corner of the photograph. */
export function drawAiTag(ctx: CanvasRenderingContext2D, box: Box, text = AI_TAG): void {
  const fontPx = Math.max(12, Math.round(Math.min(box.w, box.h) * 0.032));
  ctx.save();
  ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.letterSpacing = "0px";
  const padX = fontPx * 0.75;
  const padY = fontPx * 0.5;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontPx + padY * 2;
  const inset = fontPx * 1.1;
  const x = box.x + box.w - w - inset;
  const y = box.y + box.h - h - inset;
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(9, 12, 20, 0.72)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + fontPx * 0.04);
  ctx.restore();
}
