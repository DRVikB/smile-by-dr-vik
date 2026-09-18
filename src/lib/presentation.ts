import { jpegToPdf } from "./pdf";

/**
 * The DR ViK before/after page: near-black, champagne gold, editorial serif.
 * Composed at A4 landscape proportions so the same artwork serves the
 * chairside screen and the take-away PDF without a second layout.
 */
export const BRAND = {
  ink: "#0A0A0A",
  gold: "#C9A96E",
  paper: "#F4F1EC",
  muted: "rgba(244, 241, 236, 0.58)",
} as const;

/** A4 landscape at roughly 210 dpi. */
const PAGE_W = 2480;
const PAGE_H = 1754;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/**
 * Draw an image to fit a box without cropping, and report where it actually
 * landed so rules and captions can hug the photograph rather than the cell.
 */
function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

/**
 * Recolour artwork to a flat brand colour, keeping its alpha.
 *
 * The mark is dark artwork and the page is near-black, so it has to be
 * lightened. ctx.filter would do it in one line but is missing or ignored on
 * several iPadOS versions, which silently leaves a dark logo on a dark page —
 * compositing works everywhere.
 */
function tinted(
  img: HTMLImageElement,
  colour: string,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the logo.");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export interface PresentationOptions {
  patientName?: string;
  /** Shown instead of the clinical line when the preview is a demo. */
  isDemo?: boolean;
  date?: Date;
}

export function presentationDate(date = new Date()): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function composePresentation(
  before: string,
  after: string,
  options: PresentationOptions = {},
): Promise<Blob> {
  const [b, a, logo] = await Promise.all([
    loadImage(before),
    loadImage(after),
    loadImage("/dr-vik-logo.png"),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not build the presentation.");

  const serif = (px: number, style = "") =>
    `${style} ${px}px "New York", "Iowan Old Style", Georgia, "Times New Roman", serif`.trim();
  const sans = (px: number, weight = 400) =>
    `${weight} ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;

  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = 130;
  const contentW = PAGE_W - margin * 2;

  // Header: wordmark left, the mark right.
  ctx.textBaseline = "top";
  ctx.fillStyle = BRAND.paper;
  ctx.font = serif(58);
  ctx.letterSpacing = "14px";
  ctx.fillText("SMILE", margin, 104);
  ctx.letterSpacing = "0px";

  const logoW = 268;
  const logoH = (logoW * logo.naturalHeight) / logo.naturalWidth;
  ctx.drawImage(
    tinted(logo, BRAND.paper, logoW * 2, logoH * 2),
    PAGE_W - margin - logoW,
    92,
    logoW,
    logoH,
  );

  ctx.fillStyle = BRAND.gold;
  ctx.fillRect(margin, 206, 78, 2);

  // A gold hairline just inside the page edge, so the sheet reads as a piece.
  ctx.strokeStyle = "rgba(201, 169, 110, 0.32)";
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, PAGE_W - 88, PAGE_H - 88);

  // The photographs.
  const gap = 64;
  const cellW = (contentW - gap) / 2;
  const cellY = 288;
  const cellH = 1010;
  const left = drawContained(ctx, b, margin, cellY, cellW, cellH);
  const right = drawContained(ctx, a, margin + cellW + gap, cellY, cellW, cellH);
  // The gold rule hugs the preview photograph itself, not its cell.
  ctx.strokeStyle = "rgba(201, 169, 110, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(right.x - 9, right.y - 9, right.w + 18, right.h + 18);

  const captionY = cellY + cellH + 40;
  const caption = (x: number, label: string, gold: boolean) => {
    ctx.fillStyle = gold ? BRAND.gold : BRAND.muted;
    ctx.font = sans(26, 500);
    ctx.letterSpacing = "5px";
    ctx.fillText(label.toUpperCase(), x, captionY);
    ctx.letterSpacing = "0px";
  };
  caption(left.x, "Today", false);
  caption(right.x, options.isDemo ? "Demo preview" : "Your smile preview", true);

  // The line.
  ctx.fillStyle = BRAND.paper;
  ctx.font = serif(78, "italic");
  ctx.fillText("A smile that’s still you.", margin, captionY + 78);

  // Footer.
  const footY = PAGE_H - 168;
  ctx.fillStyle = "rgba(244, 241, 236, 0.14)";
  ctx.fillRect(margin, footY, contentW, 1);

  ctx.fillStyle = BRAND.muted;
  ctx.font = sans(25);
  const name = options.patientName?.trim();
  ctx.fillText(
    [name || null, presentationDate(options.date)].filter(Boolean).join(" · "),
    margin,
    footY + 36,
  );

  const note = options.isDemo
    ? "Demo preview — sample imagery, not a patient result."
    : "Digital smile simulation, for discussion only. It shows tooth shape and shade — not gum position, tooth movement or bite. The final result may differ following assessment and treatment planning.";
  ctx.font = sans(23);
  const words = note.split(" ");
  let line = "";
  let ly = footY + 82;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > contentW - 460) {
      ctx.fillText(line, margin, ly);
      line = word;
      ly += 32;
    } else line = next;
  }
  if (line) ctx.fillText(line, margin, ly);

  ctx.textAlign = "right";
  ctx.fillStyle = BRAND.gold;
  ctx.font = sans(25, 500);
  ctx.fillText("drvik.co.uk", PAGE_W - margin, footY + 36);
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not build the presentation."))),
      "image/jpeg",
      0.94,
    ),
  );
}

/** The same artwork as a one-page A4 PDF. */
export async function presentationPdf(
  before: string,
  after: string,
  options: PresentationOptions = {},
): Promise<Blob> {
  const jpeg = await composePresentation(before, after, options);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const pdf = jpegToPdf(bytes, PAGE_W, PAGE_H, {
    background: [10 / 255, 10 / 255, 10 / 255],
    title: options.patientName
      ? `Smile preview — ${options.patientName}`
      : "Smile preview",
  });
  return new Blob([bytes_to_buffer(pdf)], { type: "application/pdf" });
}

function bytes_to_buffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
