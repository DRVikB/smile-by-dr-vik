import { AI_TAG, drawAiTag } from "./aiTag";
import { designCredit, drawBrandLockup } from "./brand";
import { DEMO_DISCLAIMER, designSummary, PREVIEW_DISCLAIMER } from "./consultation";
import { canvasOf, caption, drawPhoto, loadImage, measureParagraph, paragraph, PAPER, rule, sans, serif, toJpeg } from "./exportCanvas";
import { A4_LONG, A4_SHORT, jpegToPdf } from "./pdf";
import type { SmileSettings } from "./types";

/** What both patient exports are made from: the saved case, never a later draft. */
export interface PatientExportInput {
  before: string;
  after: string;
  /** The settings this concept was generated with; absent on older saved cases. */
  settings?: SmileSettings;
  referenceUsed?: boolean;
  /** The design was guided by the clinician's own finished cases (Case Library). */
  styleUsed?: boolean;
  isDemo: boolean;
  /** Case reference or first name, for file names and the report header. */
  patientLabel?: string;
  /** The case's consultation record: goals, preferred reason and next step (report only). */
  consultation?: import("./caseConsultation").CaseConsultation;
  /** True when this is the version the patient chose as their preferred direction. */
  preferred?: boolean;
}

/** Ivory, as PDF RGB. */
export const PAPER_RGB: [number, number, number] = [250 / 255, 248 / 255, 244 / 255];

/**
 * The Smile Preview: what could my smile look like? Almost entirely visual —
 * the before and the concept, large, with two lines about the design. Portrait
 * photos sit side by side; landscape close-ups stack, so it reads well on a
 * phone, in WhatsApp or full screen.
 */
export async function composeSmilePreview(input: PatientExportInput): Promise<Blob> {
  const [b, a] = await Promise.all([loadImage(input.before), loadImage(input.after)]);
  const aspect = a.naturalWidth / a.naturalHeight;
  const stacked = aspect > 1.05;
  const W = stacked ? 1500 : 2000;
  const margin = stacked ? 84 : 96;
  const contentW = W - margin * 2;
  const gap = 28;
  const cellW = stacked ? contentW : (contentW - gap) / 2;
  const cellH = Math.min(cellW / aspect, stacked ? 1080 : 1400);
  const captionPx = stacked ? 21 : 23;
  const captionBlock = 26 + captionPx + 10;
  const top = stacked ? 158 : 176;
  const imagesH = stacked ? cellH * 2 + captionBlock + 40 + captionBlock : cellH + captionBlock;

  const summary = input.settings ? designSummary(input.settings) : null;
  const disclaimer = input.isDemo ? `${DEMO_DISCLAIMER} ${PREVIEW_DISCLAIMER}` : PREVIEW_DISCLAIMER;
  const measure = canvasOf(1, 1).ctx;
  const summaryH = summary
    ? 78 + 82 + measureParagraph(measure, summary.headline, contentW, sans(31, 500), 42) + 6 + measureParagraph(measure, summary.detail, contentW, sans(28), 38)
    : 0;
  const disclaimerH = measureParagraph(measure, disclaimer, contentW, sans(20), 28);
  const height = top + imagesH + summaryH + 64 + disclaimerH + margin * 0.8;

  const { canvas, ctx } = canvasOf(W, height);
  drawBrandLockup(ctx, margin, stacked ? 70 : 78, stacked ? 380 : 430, PAPER.ink);
  const credit = designCredit();
  if (credit) {
    ctx.font = sans(stacked ? 20 : 22);
    ctx.fillStyle = PAPER.faint;
    ctx.textAlign = "right";
    ctx.fillText(credit, W - margin, stacked ? 84 : 94);
    ctx.textAlign = "left";
  }

  const radius = stacked ? 22 : 26;
  const tag = input.isDemo ? "Demo preview" : AI_TAG;
  let beforeBox, conceptBox;
  if (stacked) {
    beforeBox = drawPhoto(ctx, b, { x: margin, y: top, w: cellW, h: cellH }, radius);
    caption(ctx, "Before", beforeBox.x, beforeBox.y + beforeBox.h + 22, captionPx, PAPER.muted);
    const conceptY = top + cellH + captionBlock + 40;
    conceptBox = drawPhoto(ctx, a, { x: margin, y: conceptY, w: cellW, h: cellH }, radius);
    caption(ctx, "Concept", conceptBox.x, conceptBox.y + conceptBox.h + 22, captionPx, PAPER.champagne);
  } else {
    beforeBox = drawPhoto(ctx, b, { x: margin, y: top, w: cellW, h: cellH }, radius);
    conceptBox = drawPhoto(ctx, a, { x: margin + cellW + gap, y: top, w: cellW, h: cellH }, radius);
    caption(ctx, "Before", beforeBox.x, beforeBox.y + beforeBox.h + 24, captionPx, PAPER.muted);
    caption(ctx, "Concept", conceptBox.x, conceptBox.y + conceptBox.h + 24, captionPx, PAPER.champagne);
  }
  drawAiTag(ctx, conceptBox, tag);

  let y = top + imagesH + 78;
  if (summary) {
    rule(ctx, margin, y, 56, PAPER.champagne, 2);
    ctx.font = serif(48);
    ctx.fillStyle = PAPER.ink;
    ctx.fillText("Your smile concept", margin, y + 22);
    y += 60 + 22;
    y += paragraph(ctx, summary.headline, margin, y, contentW, sans(31, 500), PAPER.ink, 42) + 6;
    paragraph(ctx, summary.detail, margin, y, contentW, sans(28), PAPER.muted, 38);
  }
  const footY = height - margin * 0.8 - disclaimerH;
  rule(ctx, margin, footY - 30, contentW);
  paragraph(ctx, disclaimer, margin, footY, contentW, sans(20), PAPER.faint, 28);
  return toJpeg(canvas, 0.93);
}

/** The same Smile Preview as a single-page PDF, on ivory. */
export async function smilePreviewPdf(image: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const { width, height } = await imageSize(image);
  // A document for the patient record: portrait A4 unless the preview is clearly wide.
  const landscape = width / height > 1.2;
  const pdf = jpegToPdf(bytes, width, height, {
    background: PAPER_RGB,
    title: "Your SmileCompose smile preview",
    pageWidth: landscape ? A4_LONG : A4_SHORT,
    pageHeight: landscape ? A4_SHORT : A4_LONG,
  });
  return new Blob([toBuffer(pdf)], { type: "application/pdf" });
}

export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
