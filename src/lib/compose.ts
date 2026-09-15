import type { GenerationResult } from "./types";

export type ComposeLayout = "split" | "stacked";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/** Draw an image cropped to cover the destination rectangle (no distortion). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const dar = dw / dh;
  const iar = img.naturalWidth / img.naturalHeight;
  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;
  if (iar > dar) {
    sw = sh * dar;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = sw / dar;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
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

/** Compose the before/after into a shareable, labelled image. Returns a JPEG blob. */
export async function composeBeforeAfter(
  before: string,
  after: string,
  layout: ComposeLayout,
  result: GenerationResult,
): Promise<Blob> {
  const [b, a] = await Promise.all([loadImage(before), loadImage(after)]);
  const cellW = Math.max(1000, a.naturalWidth);
  const cellH = Math.round((cellW * a.naturalHeight) / a.naturalWidth);
  const gap = Math.round(cellW * 0.014);
  const footerH = Math.round(cellW * 0.12);
  const isMock = result.mode === "mock";

  const canvas = document.createElement("canvas");
  const cells =
    layout === "split"
      ? [
          { x: 0, y: 0 },
          { x: cellW + gap, y: 0 },
        ]
      : [
          { x: 0, y: 0 },
          { x: 0, y: cellH + gap },
        ];
  const imagesW = layout === "split" ? cellW * 2 + gap : cellW;
  const imagesH = layout === "split" ? cellH : cellH * 2 + gap;
  canvas.width = imagesW;
  canvas.height = imagesH + footerH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Saving is not available in this browser.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCover(ctx, b, cells[0].x, cells[0].y, cellW, cellH);
  drawCover(ctx, a, cells[1].x, cells[1].y, cellW, cellH);

  const labelFont = Math.round(cellW * 0.03);
  const m = Math.round(cellW * 0.03);
  pill(ctx, cells[0].x + m, cells[0].y + m, "Before", "rgba(9,12,20,0.62)", "#ffffff", labelFont);
  pill(
    ctx,
    cells[1].x + m,
    cells[1].y + m,
    isMock ? "Demo — unchanged" : "Dr Vik preview",
    isMock ? "rgba(9,12,20,0.62)" : "rgba(18,104,255,0.92)",
    "#ffffff",
    labelFont,
  );

  // Footer
  const fy = imagesH;
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, fy, canvas.width, footerH);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(cellW * 0.03)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.fillText("DR ViK", m, fy + footerH * 0.42);
  ctx.fillStyle = "#8b93a2";
  ctx.font = `500 ${Math.round(cellW * 0.016)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText("SMILE STUDIO", m, fy + footerH * 0.66);

  ctx.fillStyle = "#9aa2b1";
  ctx.font = `${Math.round(cellW * 0.0145)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const noteX = Math.round(cellW * 0.24);
  ctx.fillText(
    isMock
      ? "Demo mode — original photo shown unchanged."
      : "Digital smile simulation for visual communication only.",
    noteX,
    fy + footerH * 0.42,
  );
  ctx.fillText(
    "The final clinical result may differ following assessment, treatment planning and material selection.",
    noteX,
    fy + footerH * 0.66,
  );

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save image."))),
      "image/jpeg",
      0.95,
    ),
  );
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
