import type { GenerationResult, PreviewPreferences } from "./types";
import { preferenceRows, wrapText } from "./report";
import { drawAiTag } from "./aiTag";
import { treatmentImplications } from "./implications";

export type ComposeLayout = "split" | "stacked";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rounded pill label anchored at its top-left corner. */
function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  fontPx: number,
) {
  ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  const padX = fontPx * 0.72;
  const padY = fontPx * 0.5;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontPx + padY * 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + fontPx * 0.04);
}

/** All export layouts share the same branding and patient preference report. */
export async function composeReport(
  after: string,
  result: GenerationResult,
  preferences?: PreviewPreferences,
  testMode = false,
  before?: string,
  layout: ComposeLayout = "split",
): Promise<Blob> {
  const [a, b, logo] = await Promise.all([
    loadImage(after), before ? loadImage(before) : undefined, loadImage("/dr-vik-logo.png"),
  ]);
  const width = b && layout === "split" ? 2000 : 1200;
  const unit = width / 1200;
  const margin = 48 * unit;
  const gap = 16 * unit;
  const cellW = b && layout === "split" ? (width - gap) / 2 : width;
  const cellH = Math.min(cellW * 2, Math.round(cellW * a.naturalHeight / a.naturalWidth));
  const headerH = 152 * unit;
  const imagesH = b && layout === "stacked" ? cellH * 2 + gap : cellH;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Saving is not available in this browser.");
  const font = (size: number, weight = 400) => `${weight} ${size * unit}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  const contentW = width - margin * 2;
  const rows = preferences ? preferenceRows(preferences.settings) : [];
  if (preferences?.referenceUsed !== undefined) rows.push(["Reference smile", preferences.referenceUsed ? "Included" : "None"]);
  ctx.font = font(23);
  const rowLines = rows.map(([label, value]) => ({label, lines: wrapText(ctx, value, contentW / 2 - 28 * unit)}));
  const rowHeights = Array.from({length: Math.ceil(rows.length / 2)}, (_, i) =>
    58 * unit + Math.max(rowLines[i * 2].lines.length, rowLines[i * 2 + 1]?.lines.length ?? 0) * 30 * unit);
  const notes = preferences?.settings.notes.trim();
  const noteLines = notes ? wrapText(ctx, notes, contentW) : [];
  const isDemo = testMode || preferences?.testMode || result.mode === "mock";
  const disclaimer = isDemo
    ? "DEMO PREVIEW · Sample imagery. The selected preferences are illustrative only."
    : "Digital smile simulation for discussion only. The final clinical result may differ following assessment, treatment planning and material selection.";
  ctx.font = font(20);
  const disclaimerLines = wrapText(ctx, disclaimer, contentW);
  // What getting there would involve: rules-based, so it adds no AI cost.
  const implications = preferences && !isDemo ? treatmentImplications(preferences.settings, result) : null;
  ctx.font = font(21);
  const implicationBlocks = implications?.items.map((item) => ({
    title: item.title,
    lines: wrapText(ctx, item.detail, contentW),
  })) ?? [];
  const confirmLines = implications
    ? wrapText(ctx, `To confirm at assessment: ${implications.confirm.join(" · ")}.`, contentW)
    : [];
  const implicationsH = implications
    ? 80 * unit
      + implicationBlocks.reduce((sum, b) => sum + 36 * unit + b.lines.length * 29 * unit + 14 * unit, 0)
      + 12 * unit + confirmLines.length * 29 * unit + 24 * unit
    : 0;
  const reportH = 140 * unit + (rows.length ? rowHeights.reduce((a, b) => a + b, 0) : 100 * unit)
    + (notes ? 65 * unit + noteLines.length * 31 * unit : 0) + implicationsH + 54 * unit + disclaimerLines.length * 28 * unit;
  canvas.width = width;
  canvas.height = Math.ceil(headerH + imagesH + reportH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#1d1d1f";
  ctx.font = font(34, 500);
  ctx.fillText("S M I L E", margin, 39 * unit);
  ctx.fillStyle = "#6e6e73";
  ctx.font = font(21);
  ctx.fillText("Your smile preview", margin, 91 * unit);
  const logoW = 195 * unit;
  const logoH = logoW * logo.naturalHeight / logo.naturalWidth;
  ctx.drawImage(logo, width - margin - logoW, (headerH - logoH) / 2, logoW, logoH);

  const drawPhoto = (img: HTMLImageElement, x: number, y: number, label: string) => {
    // Fit the whole photograph so unusually tall uploads are never cropped.
    ctx.fillStyle = "#121110";
    ctx.fillRect(x, y, cellW, cellH);
    const scale = Math.min(cellW / img.naturalWidth, cellH / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
    pill(ctx, x + 24 * unit, y + 24 * unit, label, "rgba(9,12,20,.72)", "#ffffff", 22 * unit);
    return { x: x + (cellW - w) / 2, y: y + (cellH - h) / 2, w, h };
  };
  if (b) drawPhoto(b, 0, headerH, "Original");
  const afterBox = drawPhoto(a, b && layout === "split" ? cellW + gap : 0,
    headerH + (b && layout === "stacked" ? cellH + gap : 0), isDemo ? "Demo preview" : "Smile preview");
  if (!isDemo) drawAiTag(ctx, afterBox);

  const reportY = headerH + imagesH;
  ctx.fillStyle = "#f5f5f7";
  ctx.fillRect(0, reportY, width, reportH);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#1d1d1f";
  ctx.font = font(34, 500);
  ctx.fillText("Your smile preferences", margin, reportY + 42 * unit);
  let y = reportY + 114 * unit;
  rowHeights.forEach((height, index) => {
    for (let col = 0; col < 2; col++) {
      const row = rowLines[index * 2 + col];
      if (!row) continue;
      const x = margin + col * contentW / 2;
      ctx.fillStyle = "#6e6e73"; ctx.font = font(19);
      ctx.fillText(row.label, x, y);
      ctx.fillStyle = "#1d1d1f"; ctx.font = font(23, 500);
      row.lines.forEach((line, i) => ctx.fillText(line, x, y + 29 * unit + i * 30 * unit));
    }
    y += height;
  });
  if (!preferences) {
    ctx.font = font(22); ctx.fillStyle = "#6e6e73";
    wrapText(ctx, "Preferences were not recorded for this older preview. Create a new preview to include them.", contentW)
      .forEach((line, i) => ctx.fillText(line, margin, y + i * 30 * unit));
    y += 100 * unit;
  }
  if (notes) {
    ctx.font = font(19); ctx.fillStyle = "#6e6e73"; ctx.fillText("Notes", margin, y);
    ctx.font = font(23); ctx.fillStyle = "#1d1d1f";
    noteLines.forEach((line, i) => ctx.fillText(line, margin, y + 31 * unit + i * 31 * unit));
    y += 65 * unit + noteLines.length * 31 * unit;
  }
  if (implications) {
    ctx.fillStyle = "#d2d2d7"; ctx.fillRect(margin, y + 4 * unit, contentW, unit);
    ctx.fillStyle = "#1d1d1f"; ctx.font = font(28, 500);
    ctx.fillText("What this would take", margin, y + 30 * unit);
    y += 80 * unit;
    for (const block of implicationBlocks) {
      ctx.fillStyle = "#1d1d1f"; ctx.font = font(22, 600);
      ctx.fillText(block.title, margin, y);
      ctx.fillStyle = "#6e6e73"; ctx.font = font(21);
      block.lines.forEach((line, i) => ctx.fillText(line, margin, y + 36 * unit + i * 29 * unit));
      y += 36 * unit + block.lines.length * 29 * unit + 14 * unit;
    }
    y += 12 * unit;
    ctx.fillStyle = "#1d1d1f"; ctx.font = font(21);
    confirmLines.forEach((line, i) => ctx.fillText(line, margin, y + i * 29 * unit));
    y += confirmLines.length * 29 * unit + 24 * unit;
  }
  ctx.fillStyle = "#d2d2d7"; ctx.fillRect(margin, y + 4 * unit, contentW, unit);
  ctx.fillStyle = "#6e6e73"; ctx.font = font(20);
  disclaimerLines.forEach((line, i) => ctx.fillText(line, margin, y + 28 * unit + i * 28 * unit));
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not save image.")), "image/jpeg", 0.95));
}

export function composeBeforeAfter(before: string, after: string, layout: ComposeLayout,
  result: GenerationResult, preferences?: PreviewPreferences, testMode = false): Promise<Blob> {
  return composeReport(after, result, preferences, testMode, before, layout);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
