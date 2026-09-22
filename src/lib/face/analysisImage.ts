import { drawAiTag } from "../aiTag";
import { BRAND, tinted } from "../presentation";
import { wrapText } from "../report";
import { analyseSmile, analysisRows, IRIS_DIAMETER_MM, type Box, type SmileAnalysis } from "./analysis";
import type { Point } from "./geometry";
import { detectFace } from "./landmarks";

export class NoFaceError extends Error {
  constructor() {
    super("Smile analysis needs a full-face photo with both eyes in view.");
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

const WIDTH = 1600;
const MARGIN = 72;
const GOLD = BRAND.gold;
const LINE = "rgba(255, 255, 255, 0.92)";
const sans = (px: number, weight = 400) =>
  `${weight} ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;

/** Draw a crop of `img` into a panel and return the mapping from photo pixels to canvas. */
function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, crop: Box, panel: Box) {
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, panel.x, panel.y, panel.w, panel.h);
  const sx = panel.w / crop.w, sy = panel.h / crop.h;
  return (p: Point): Point => [panel.x + (p[0] - crop.x) * sx, panel.y + (p[1] - crop.y) * sy];
}

/** A straight line through `p` along `dir`, clipped to the panel. */
function infiniteLine(
  ctx: CanvasRenderingContext2D,
  map: (p: Point) => Point,
  p: Point,
  dir: Point,
  panel: Box,
) {
  const a = map(p), b = map([p[0] + dir[0] * 100, p[1] + dir[1] * 100]);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.hypot(panel.w, panel.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(panel.x, panel.y, panel.w, panel.h);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(a[0] - (dx / len) * reach, a[1] - (dy / len) * reach);
  ctx.lineTo(a[0] + (dx / len) * reach, a[1] + (dy / len) * reach);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, p: Point, r: number, colour: string) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function drawGuides(
  ctx: CanvasRenderingContext2D,
  a: SmileAnalysis,
  map: (p: Point) => Point,
  panel: Box,
  scale: number,
  full: boolean,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 4 * scale;
  const ipDir: Point = [a.midline.direction[1], -a.midline.direction[0]];
  if (full) {
    // Interpupillary line.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5 * scale;
    infiniteLine(ctx, map, a.pupils[0], ipDir, panel);
    a.pupils.forEach((p) => dot(ctx, map(p), 5 * scale, GOLD));
  }
  // Facial midline.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([10 * scale, 8 * scale]);
  infiniteLine(ctx, map, a.midline.through, a.midline.direction, panel);
  ctx.setLineDash([]);
  // Mouth-corner line, drawn across the smile only.
  const [c0, c1] = a.commissures.map(map);
  const ext = (full ? 0.25 : 0.12) * Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const ux = (c1[0] - c0[0]) / Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const uy = (c1[1] - c0[1]) / Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  ctx.strokeStyle = "rgba(120, 200, 220, 0.95)";
  ctx.lineWidth = 2.5 * scale;
  ctx.beginPath();
  ctx.moveTo(c0[0] - ux * ext, c0[1] - uy * ext);
  ctx.lineTo(c1[0] + ux * ext, c1[1] + uy * ext);
  ctx.stroke();
  [c0, c1].forEach((p) => dot(ctx, p, 5 * scale, "rgba(120, 200, 220, 0.95)"));
  if (!full) {
    // Lower-lip curve: the line the upper incisal edges usually follow.
    const curve = a.lowerLipCurve.map(map);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for (let i = 1; i < curve.length - 1; i++) {
      const mx = (curve[i][0] + curve[i + 1][0]) / 2, my = (curve[i][1] + curve[i + 1][1]) / 2;
      ctx.quadraticCurveTo(curve[i][0], curve[i][1], mx, my);
    }
    const last = curve[curve.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Fit a crop box to a panel aspect ratio by growing it, never cropping tighter. */
function fitAspect(box: Box, aspect: number, width: number, height: number): Box {
  let { x, y, w, h } = box;
  if (w / h > aspect) {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  } else {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  }
  // Slide back inside the photo where possible.
  x = Math.min(Math.max(0, x), Math.max(0, width - w));
  y = Math.min(Math.max(0, y), Math.max(0, height - h));
  return { x, y, w: Math.min(w, width), h: Math.min(h, height) };
}

/**
 * The smile analysis sheet: the face with its reference lines, the smile
 * today and as illustrated, and the measurements in plain words.
 */
export async function composeAnalysis(
  before: string,
  after: string,
  options: { isDemo?: boolean } = {},
): Promise<Blob> {
  const [b, a, logo, beforePts, afterPts] = await Promise.all([
    loadImage(before),
    loadImage(after),
    loadImage("/dr-vik-logo.png"),
    detectFace(before),
    detectFace(after),
  ]);
  const analysis = analyseSmile(beforePts, b.naturalWidth, b.naturalHeight);
  if (!analysis) throw new NoFaceError();
  // The after image is face-locked, so its landmarks normally match; use its
  // own where found so the lines sit exactly on what's shown.
  const afterAnalysis = analyseSmile(afterPts, a.naturalWidth, a.naturalHeight) ?? analysis;

  const contentW = WIDTH - MARGIN * 2;
  const headerH = 170;
  const faceAspect = 4 / 3.4;
  const faceW = contentW;
  const faceH = Math.round(faceW / faceAspect);
  const gap = 28;
  const mouthW = (contentW - gap) / 2;
  const mouthAspect = 16 / 10;
  const mouthH = Math.round(mouthW / mouthAspect);
  const rows = analysisRows(analysis);
  const notes =
    `Lines are drawn from facial landmarks found on this device. Distances are approximate, scaled from an average iris (${IRIS_DIAMETER_MM} mm). ` +
    "For discussion — not for diagnosis or treatment planning.";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not build the analysis.");
  ctx.font = sans(22);
  const noteLines = wrapText(ctx, notes, contentW);
  const rowH = 124;
  const tableH = Math.ceil(rows.length / 2) * rowH;
  const legendH = 60;
  const height =
    headerH + faceH + 60 + 40 + mouthH + 70 + legendH + 40 + tableH + 30 + noteLines.length * 32 + MARGIN;
  canvas.width = WIDTH;
  canvas.height = Math.ceil(height);

  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = BRAND.paper;
  ctx.font = `44px "New York", "Iowan Old Style", Georgia, serif`;
  ctx.letterSpacing = "10px";
  ctx.fillText("SMILE", MARGIN, 58);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = BRAND.muted;
  ctx.font = sans(24);
  ctx.fillText("Smile analysis", MARGIN, 116);
  const logoW = 190, logoH = (logoW * logo.naturalHeight) / logo.naturalWidth;
  ctx.drawImage(tinted(logo, BRAND.paper, logoW * 2, logoH * 2), WIDTH - MARGIN - logoW, 60, logoW, logoH);

  // Face overview, on the illustrated smile.
  let y = headerH;
  const facePanel: Box = { x: MARGIN, y, w: faceW, h: faceH };
  const faceCrop = fitAspect(afterAnalysis.faceBox, faceAspect, a.naturalWidth, a.naturalHeight);
  const faceMap = drawCrop(ctx, a, faceCrop, facePanel);
  drawGuides(ctx, afterAnalysis, faceMap, facePanel, faceW / 1100, true);
  if (!options.isDemo) drawAiTag(ctx, facePanel);
  y += faceH + 24;
  ctx.fillStyle = BRAND.muted;
  ctx.font = sans(22, 500);
  ctx.fillText("FACE · REFERENCE LINES", MARGIN, y);
  y += 36 + 40;

  // Smile close-ups: today and illustrated.
  const panels: [HTMLImageElement, SmileAnalysis, string, boolean][] = [
    [b, analysis, "TODAY", false],
    [a, afterAnalysis, options.isDemo ? "DEMO PREVIEW" : "AI ILLUSTRATION", !options.isDemo],
  ];
  panels.forEach(([img, an, label, tag], i) => {
    const panel: Box = { x: MARGIN + i * (mouthW + gap), y, w: mouthW, h: mouthH };
    const crop = fitAspect(an.mouthBox, mouthAspect, img.naturalWidth, img.naturalHeight);
    const map = drawCrop(ctx, img, crop, panel);
    drawGuides(ctx, an, map, panel, mouthW / 700, false);
    if (tag) drawAiTag(ctx, panel);
    ctx.fillStyle = i ? GOLD : BRAND.muted;
    ctx.font = sans(22, 500);
    ctx.letterSpacing = "4px";
    ctx.fillText(label, panel.x, y + mouthH + 22);
    ctx.letterSpacing = "0px";
  });
  y += mouthH + 70;

  // Legend.
  const legend: [string, string, boolean][] = [
    [GOLD, "Eye line", false],
    ["rgba(255,255,255,0.92)", "Facial midline", true],
    ["rgba(120, 200, 220, 0.95)", "Mouth corners", false],
    [GOLD, "Lower-lip curve (smile arc guide)", false],
  ];
  let lx = MARGIN;
  ctx.font = sans(21);
  for (const [colour, text, dashed] of legend) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.beginPath();
    ctx.moveTo(lx, y + 13);
    ctx.lineTo(lx + 34, y + 13);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = BRAND.paper;
    ctx.fillText(text, lx + 46, y);
    lx += 46 + ctx.measureText(text).width + 40;
  }
  y += legendH;

  // Measurements.
  ctx.fillStyle = "rgba(244, 241, 236, 0.14)";
  ctx.fillRect(MARGIN, y, contentW, 1);
  y += 40;
  rows.forEach((row, i) => {
    const x = MARGIN + (i % 2) * (contentW / 2);
    const ry = y + Math.floor(i / 2) * rowH;
    ctx.fillStyle = BRAND.muted;
    ctx.font = sans(20);
    ctx.fillText(row.label, x, ry);
    ctx.fillStyle = BRAND.paper;
    ctx.font = sans(30, 500);
    ctx.fillText(row.value, x, ry + 26);
    ctx.fillStyle = BRAND.muted;
    ctx.font = sans(18);
    ctx.fillText(row.note, x, ry + 64);
  });
  y += tableH + 30;
  ctx.fillStyle = BRAND.muted;
  ctx.font = sans(22);
  noteLines.forEach((line, i) => ctx.fillText(line, MARGIN, y + i * 32));

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not build the analysis."))),
      "image/jpeg",
      0.93,
    ),
  );
}
