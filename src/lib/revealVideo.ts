import { drawAiTag } from "./aiTag";
import { BRAND, tinted } from "./presentation";

/**
 * A short reveal video made on the device: the patient's own smile, then the
 * illustrated smile fading in over it while the frame eases towards the
 * mouth. It is a crossfade between two images already approved on screen —
 * nothing is generated, so it can't invent teeth the way AI video can.
 */

export const REVEAL = {
  /** Their smile today, held. */
  hold: 1300,
  /** The illustration fading in. */
  fade: 2200,
  /** The illustration, held. */
  after: 2300,
} as const;
export const REVEAL_TOTAL = REVEAL.hold + REVEAL.fade + REVEAL.after;
/** How far the frame eases in towards the mouth by the end. */
export const REVEAL_ZOOM = 1.5;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** At `ms` into the video: how much of the illustration shows, and the zoom. */
export function revealFrame(ms: number): { mix: number; zoom: number } {
  const mix = smooth((ms - REVEAL.hold) / REVEAL.fade);
  const zoom = 1 + (REVEAL_ZOOM - 1) * smooth(ms / (REVEAL.hold + REVEAL.fade));
  return { mix, zoom };
}

/** The first recording format this browser supports; MP4 first (iPad, iPhone). */
export function pickVideoType(isSupported: (type: string) => boolean): string | null {
  for (const type of [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ])
    if (isSupported(type)) return type;
  return null;
}

/** Output size: the photo's own shape, long side 1080, even dimensions. */
export function videoSize(width: number, height: number, longSide = 1080): { width: number; height: number } {
  const scale = longSide / Math.max(width, height);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

export interface RevealOptions {
  isDemo?: boolean;
  /** Where to ease in towards, as a fraction of the photo (the mouth). */
  focus?: { x: number; y: number };
}

export async function recordReveal(
  before: string,
  after: string,
  options: RevealOptions = {},
): Promise<{ blob: Blob; extension: "mp4" | "webm" }> {
  if (typeof MediaRecorder === "undefined")
    throw new Error("This browser can’t record video.");
  const type = pickVideoType((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("This browser can’t record video.");

  const [b, a, logo] = await Promise.all([loadImage(before), loadImage(after), loadImage("/dr-vik-logo.png")]);
  const { width, height } = videoSize(b.naturalWidth, b.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t record video.");

  const logoW = Math.round(width * 0.2);
  const logoH = Math.round((logoW * logo.naturalHeight) / logo.naturalWidth);
  const mark = tinted(logo, BRAND.paper, logoW * 2, logoH * 2);
  const fx = (options.focus?.x ?? 0.5) * width;
  const fy = (options.focus?.y ?? 0.62) * height;
  const fontPx = Math.round(Math.min(width, height) * 0.032);

  const draw = (ms: number) => {
    const { mix, zoom } = revealFrame(ms);
    ctx.save();
    ctx.fillStyle = BRAND.ink;
    ctx.fillRect(0, 0, width, height);
    // Zoom about the mouth, but never past the photo's own edges.
    const ox = Math.min(0, Math.max(width - width * zoom, fx - fx * zoom));
    const oy = Math.min(0, Math.max(height - height * zoom, fy - fy * zoom));
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
    ctx.drawImage(b, 0, 0, width, height);
    if (mix > 0) {
      ctx.globalAlpha = mix;
      ctx.drawImage(a, 0, 0, width, height);
    }
    ctx.restore();

    // Soft shade at the foot so the captions read on any photo.
    const shade = ctx.createLinearGradient(0, height * 0.72, 0, height);
    shade.addColorStop(0, "rgba(10,10,10,0)");
    shade.addColorStop(1, "rgba(10,10,10,0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, height * 0.72, width, height * 0.28);
    ctx.drawImage(mark, width - logoW - fontPx * 1.4, fontPx * 1.4, logoW, logoH);

    ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.letterSpacing = `${Math.round(fontPx * 0.18)}px`;
    ctx.globalAlpha = 1 - mix;
    ctx.fillStyle = BRAND.paper;
    ctx.fillText("TODAY", fontPx * 1.4, height - fontPx * 1.6);
    ctx.globalAlpha = mix;
    ctx.fillStyle = BRAND.gold;
    ctx.fillText(options.isDemo ? "DEMO PREVIEW" : "A POSSIBLE SMILE", fontPx * 1.4, height - fontPx * 1.6);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
    if (!options.isDemo && mix > 0.02) {
      ctx.globalAlpha = mix;
      drawAiTag(ctx, { x: 0, y: 0, w: width, h: height });
      ctx.globalAlpha = 1;
    }
  };

  draw(0);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The video couldn’t be recorded."));
  });

  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const ms = performance.now() - start;
      draw(Math.min(ms, REVEAL_TOTAL));
      if (ms >= REVEAL_TOTAL + 150) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks, { type: type.split(";")[0] });
  if (!blob.size) throw new Error("The video couldn’t be recorded.");
  return { blob, extension: type.startsWith("video/mp4") ? "mp4" : "webm" };
}
