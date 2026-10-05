import { AI_TAG, drawAiTag } from "./aiTag";
import { designCredit, drawBrandLockup } from "./brand";
import type { ReportContent } from "./consultation";
import { ANALYSIS_CAVEAT, drawGuides, type ReportAnalysis } from "./face/analysisReport";
import type { Point } from "./face/geometry";
import { GUIDE_ORDER, GUIDE_STYLES } from "./face/guides";
import { canvasOf, caption, drawPhoto, loadImage, measureParagraph, paragraph, PAPER, roundedPath, rule, sans, serif, toJpeg } from "./exportCanvas";
import { jpegPagesToPdf } from "./pdf";
import { wrapText } from "./report";
import { PAPER_RGB, toBuffer, type PatientExportInput } from "./smilePreview";

/**
 * The Consultation Report: a personalised document, not clinical notes. The
 * before and concept lead the first page; then the proposed design, what the
 * photograph shows, what could make the biggest difference, and — on a
 * second page only when needed — today against proposed, what treatment may
 * involve and next steps. One page where possible, never more than two.
 */

/** A4 portrait at 200 dpi. */
export const PAGE_W = 1654;
export const PAGE_H = 2339;
const M = 120;
const CW = PAGE_W - M * 2;
const HEAD = 84;
const GAP = 40;
const BOTTOM = PAGE_H - 118;

interface Block {
  height: number;
  draw: (ctx: CanvasRenderingContext2D, y: number) => void;
}

function heading(ctx: CanvasRenderingContext2D, text: string, y: number) {
  rule(ctx, M, y, 44, PAPER.champagne, 2);
  ctx.font = serif(38);
  ctx.fillStyle = PAPER.ink;
  ctx.fillText(text, M, y + 20);
}

const lines = (ctx: CanvasRenderingContext2D, text: string, width: number, font: string) => {
  ctx.font = font;
  return wrapText(ctx, text, width);
};

/** "Your proposed smile": label over value, three to a row. */
function designBlock(m: CanvasRenderingContext2D, rows: [string, string][]): Block {
  const cols = 3, colW = CW / cols;
  const valueFont = sans(25, 500);
  const cells = rows.map(([label, value]) => ({ label, value: lines(m, value, colW - 28, valueFont) }));
  const rowHeights: number[] = [];
  for (let i = 0; i < cells.length; i += cols)
    rowHeights.push(28 + Math.max(...cells.slice(i, i + cols).map(c => c.value.length)) * 32 + 14);
  return {
    height: HEAD + rowHeights.reduce((a, b) => a + b, 0),
    draw(ctx, top) {
      heading(ctx, "Your proposed smile", top);
      let y = top + HEAD;
      rowHeights.forEach((h, r) => {
        cells.slice(r * cols, r * cols + cols).forEach((cell, c) => {
          const x = M + c * colW;
          ctx.font = sans(19);
          ctx.fillStyle = PAPER.muted;
          ctx.fillText(cell.label, x, y);
          ctx.font = valueFont;
          ctx.fillStyle = PAPER.ink;
          cell.value.forEach((line, i) => ctx.fillText(line, x, y + 28 + i * 32));
        });
        y += h;
      });
    },
  };
}

/** Title and sentence, one after another. */
function listBlock(m: CanvasRenderingContext2D, title: string, items: { title: string; text: string }[]): Block {
  const textFont = sans(23);
  const measured = items.map(i => ({ ...i, lines: lines(m, i.text, CW, textFont) }));
  const heights = measured.map(i => 32 + i.lines.length * 32 + 14);
  return {
    height: HEAD + heights.reduce((a, b) => a + b, 0),
    draw(ctx, top) {
      heading(ctx, title, top);
      let y = top + HEAD;
      measured.forEach((item, i) => {
        ctx.font = sans(23, 600);
        ctx.fillStyle = PAPER.ink;
        ctx.fillText(item.title, M, y);
        ctx.font = textFont;
        ctx.fillStyle = PAPER.body;
        item.lines.forEach((line, j) => ctx.fillText(line, M, y + 32 + j * 32));
        y += heights[i];
      });
    },
  };
}

/** Up to three priorities side by side, numbered in champagne. */
function prioritiesBlock(m: CanvasRenderingContext2D, items: { title: string; text: string }[]): Block {
  const colGap = 40, colW = (CW - colGap * (items.length - 1)) / items.length;
  const measured = items.map(p => ({ title: lines(m, p.title, colW, sans(23, 600)), text: lines(m, p.text, colW, sans(21)) }));
  const h = Math.max(...measured.map(p => 58 + p.title.length * 30 + 8 + p.text.length * 29));
  return {
    height: HEAD + h,
    draw(ctx, top) {
      heading(ctx, "What could make the biggest difference", top);
      measured.forEach((p, i) => {
        const x = M + i * (colW + colGap);
        const y = top + HEAD;
        ctx.font = serif(40);
        ctx.fillStyle = PAPER.champagne;
        ctx.fillText(String(i + 1), x, y);
        ctx.font = sans(23, 600);
        ctx.fillStyle = PAPER.ink;
        p.title.forEach((line, j) => ctx.fillText(line, x, y + 58 + j * 30));
        ctx.font = sans(21);
        ctx.fillStyle = PAPER.body;
        const ty = y + 58 + p.title.length * 30 + 8;
        p.text.forEach((line, j) => ctx.fillText(line, x, ty + j * 29));
      });
    },
  };
}

/** Today against proposed: three quiet columns with hairlines, no boxes. */
function comparisonBlock(m: CanvasRenderingContext2D, rows: { feature: string; today: string; proposed: string }[]): Block {
  const widths = [CW * 0.3, CW * 0.3, CW * 0.4];
  const font = sans(23);
  const measured = rows.map(r => [r.feature, r.today, r.proposed].map((v, i) => lines(m, v, widths[i] - 24, i === 2 ? sans(23, 500) : font)));
  const heights = measured.map(cells => 22 + Math.max(...cells.map(c => c.length)) * 31 + 18);
  return {
    height: HEAD + 44 + heights.reduce((a, b) => a + b, 0),
    draw(ctx, top) {
      heading(ctx, "Today and proposed", top);
      let y = top + HEAD;
      ["Feature", "Today", "Proposed"].forEach((label, i) =>
        caption(ctx, label, M + widths.slice(0, i).reduce((a, b) => a + b, 0), y + 4, 17, PAPER.muted));
      y += 44;
      measured.forEach((cells, r) => {
        rule(ctx, M, y, CW);
        cells.forEach((cell, i) => {
          ctx.font = i === 2 ? sans(23, 500) : font;
          ctx.fillStyle = i === 0 ? PAPER.muted : PAPER.ink;
          cell.forEach((line, j) => ctx.fillText(line, M + widths.slice(0, i).reduce((a, b) => a + b, 0), y + 22 + j * 31));
        });
        y += heights[r];
      });
    },
  };
}

/** What treatment may involve, with the clinical checks as a quiet two-column list. */
function overviewBlock(m: CanvasRenderingContext2D, items: { title: string; text: string; bullets?: string[] }[]): Block {
  const textFont = sans(22);
  const measured = items.map(i => ({ ...i, lines: lines(m, i.text, CW, textFont) }));
  const itemH = (i: typeof measured[number]) => 32 + i.lines.length * 31 + (i.bullets ? 12 + Math.ceil(i.bullets.length / 2) * 34 : 0) + 22;
  return {
    height: HEAD + measured.reduce((sum, i) => sum + itemH(i), 0),
    draw(ctx, top) {
      heading(ctx, "What this may involve", top);
      let y = top + HEAD;
      for (const item of measured) {
        ctx.font = sans(23, 600);
        ctx.fillStyle = PAPER.ink;
        ctx.fillText(item.title, M, y);
        ctx.font = textFont;
        ctx.fillStyle = PAPER.body;
        item.lines.forEach((line, j) => ctx.fillText(line, M, y + 32 + j * 31));
        if (item.bullets) {
          const by = y + 32 + item.lines.length * 31 + 12;
          item.bullets.forEach((b, k) => {
            const x = M + (k % 2) * (CW / 2);
            const yy = by + Math.floor(k / 2) * 34;
            ctx.fillStyle = PAPER.champagne;
            ctx.beginPath();
            ctx.arc(x + 5, yy + 13, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = textFont;
            ctx.fillStyle = PAPER.body;
            ctx.fillText(b, x + 22, yy);
          });
        }
        y += itemH(item);
      }
    },
  };
}

function textBlock(m: CanvasRenderingContext2D, title: string, text: string, font = sans(23)): Block {
  const h = measureParagraph(m, text, CW, font, 33);
  return {
    height: HEAD + h + 8,
    draw(ctx, top) {
      heading(ctx, title, top);
      paragraph(ctx, text, M, top + HEAD, CW, font, PAPER.body, 33);
    },
  };
}

/** Clinician-requested only: the reference lines on the concept and the readings in degrees. */
function technicalBlock(
  m: CanvasRenderingContext2D,
  rows: { label: string; value: string; note: string }[],
  figure: { photo: HTMLImageElement; analysis: ReportAnalysis["figure"] } | null,
): Block {
  const figW = figure?.analysis ? 380 : 0;
  const figH = figure?.analysis ? Math.round(figW * figure.analysis.crop.h / figure.analysis.crop.w) : 0;
  const textX = figW ? M + figW + 40 : M;
  const textW = CW - (figW ? figW + 40 : 0);
  const measured = rows.map(r => ({ ...r, value: lines(m, r.value, textW, sans(23, 500)), note: lines(m, r.note, textW, sans(19)) }));
  const key = GUIDE_ORDER.map(k => GUIDE_STYLES[k].label).join(" · ");
  const rowsH = measured.reduce((sum, r) => sum + 26 + r.value.length * 30 + r.note.length * 26 + 16, 0);
  const tailH = (figW ? measureParagraph(m, `Lines: ${key}.`, textW, sans(19), 26) : 0) + measureParagraph(m, ANALYSIS_CAVEAT, textW, sans(19), 26) + 10;
  return {
    height: HEAD + Math.max(figH, rowsH + tailH),
    draw(ctx, top) {
      heading(ctx, "Technical detail", top);
      const y0 = top + HEAD;
      if (figure?.analysis && figW) {
        const panel = { x: M, y: y0, w: figW, h: figH };
        const { crop, guides } = figure.analysis;
        ctx.save();
        roundedPath(ctx, panel, 16);
        ctx.clip();
        ctx.drawImage(figure.photo, crop.x, crop.y, crop.w, crop.h, panel.x, panel.y, panel.w, panel.h);
        const sx = panel.w / crop.w, sy = panel.h / crop.h;
        drawGuides(ctx, guides, (p: Point): Point => [panel.x + (p[0] - crop.x) * sx, panel.y + (p[1] - crop.y) * sy], panel, figW / 420);
        ctx.restore();
      }
      let y = y0;
      for (const r of measured) {
        ctx.font = sans(19);
        ctx.fillStyle = PAPER.muted;
        ctx.fillText(r.label, textX, y);
        ctx.font = sans(23, 500);
        ctx.fillStyle = PAPER.ink;
        r.value.forEach((line, j) => ctx.fillText(line, textX, y + 26 + j * 30));
        ctx.font = sans(19);
        ctx.fillStyle = PAPER.muted;
        const ny = y + 26 + r.value.length * 30;
        r.note.forEach((line, j) => ctx.fillText(line, textX, ny + j * 26));
        y = ny + r.note.length * 26 + 16;
      }
      if (figW) y += paragraph(ctx, `Lines: ${key}.`, textX, y, textW, sans(19), PAPER.muted, 26);
      paragraph(ctx, ANALYSIS_CAVEAT, textX, y, textW, sans(19), PAPER.faint, 26);
    },
  };
}

function pageNumber(ctx: CanvasRenderingContext2D, page: number, pages: number) {
  if (pages < 2) return;
  ctx.font = sans(18);
  ctx.fillStyle = PAPER.faint;
  ctx.textAlign = "right";
  ctx.fillText(`${page} of ${pages}`, PAGE_W - M, PAGE_H - 78);
  ctx.textAlign = "left";
}

/**
 * Fill page 1 in order and put whatever doesn't fit on page 2, never a third.
 * Null when even two pages can't hold it at this spacing.
 */
function paginate(blocks: Block[], firstTop: number, footer: number, gap: number): Block[][] | null {
  const fits = (list: Block[], top: number, withFooter: boolean) =>
    top + list.reduce((sum, bl) => sum + bl.height + gap, 0) - gap + (withFooter ? gap + footer : 0) <= BOTTOM;
  if (fits(blocks, firstTop, true)) return [blocks];
  let split = 0;
  while (split < blocks.length && fits(blocks.slice(0, split + 1), firstTop, false)) split++;
  const rest = blocks.slice(split);
  return fits(rest, 200, true) ? [blocks.slice(0, split), rest] : null;
}

export interface ConsultationPages {
  pages: Blob[];
  /** Sections the clinician asked for that two pages couldn't hold. */
  omitted: string[];
}

/**
 * The report's pages as JPEGs. `analysis` supplies the technical figure when
 * the clinician has asked for it.
 */
export async function composeConsultationReport(input: PatientExportInput, content: ReportContent, analysis: ReportAnalysis | null): Promise<ConsultationPages> {
  const [b, a] = await Promise.all([loadImage(input.before), loadImage(input.after)]);
  const m = canvasOf(1, 1).ctx;

  const build = (technical: "figure" | "rows" | "none") => {
    const blocks: Block[] = [];
    // What mattered to you, and which direction you preferred, before the design detail.
    if (content.wishes) blocks.push(textBlock(m, "What matters to you", content.wishes));
    if (content.preferred) blocks.push(textBlock(m, "Your preferred direction", content.preferred));
    if (content.design?.length) blocks.push(designBlock(m, content.design));
    if (content.glance.length) blocks.push(listBlock(m, "Your smile at a glance", content.glance));
    if (content.priorities.length) blocks.push(prioritiesBlock(m, content.priorities));
    if (content.comparison?.length) blocks.push(comparisonBlock(m, content.comparison));
    if (content.overview?.length) blocks.push(overviewBlock(m, content.overview));
    if (content.note) blocks.push(textBlock(m, "Notes from your consultation", content.note));
    blocks.push(textBlock(m, "Next steps", content.nextSteps));
    if (content.technical?.length && technical !== "none")
      blocks.push(technicalBlock(m, content.technical, technical === "figure" && analysis?.figure ? { photo: a, analysis: analysis.figure } : null));
    return blocks;
  };

  const disclaimerH = measureParagraph(m, content.disclaimer, CW, sans(18), 25);
  const footer = 34 + disclaimerH;

  // Page 1: header and the before / concept, about two fifths of the page.
  const aspect = a.naturalWidth / a.naturalHeight;
  const heroTop = 302;
  const cellW = (CW - 28) / 2;
  const cellH = Math.min(cellW / aspect, PAGE_H * 0.35);
  const firstTop = heroTop + cellH + 22 + 26 + 50;

  // Everything the clinician asked for, as generously spaced as two pages allow.
  const attempts: ["figure" | "rows" | "none", number][] = [["figure", GAP], ["rows", GAP], ["rows", 30], ["none", 30]];
  let plan: Block[][] | null = null;
  let omitted: string[] = [];
  let gap = GAP;
  for (const [technical, spacing] of attempts) {
    plan = paginate(build(technical), firstTop, footer, spacing);
    if (plan) {
      gap = spacing;
      omitted = technical === "none" && content.technical?.length ? ["Technical detail"] : [];
      break;
    }
  }
  const pagesBlocks = plan ?? [build("none")];
  const pages: Blob[] = [];

  for (let p = 0; p < pagesBlocks.length; p++) {
    const { canvas, ctx } = canvasOf(PAGE_W, PAGE_H);
    let y: number;
    if (p === 0) {
      drawBrandLockup(ctx, M, 100, 400, PAPER.ink);
      const credit = designCredit();
      if (credit) {
        ctx.font = sans(22);
        ctx.fillStyle = PAPER.muted;
        ctx.textAlign = "right";
        ctx.fillText(credit, PAGE_W - M, 112);
        ctx.textAlign = "left";
      }
      ctx.font = serif(56);
      ctx.fillStyle = PAPER.ink;
      ctx.fillText("Personalised Smile Consultation", M, 176);
      ctx.font = sans(23);
      ctx.fillStyle = PAPER.muted;
      ctx.fillText([content.patientLabel ? `Prepared for ${content.patientLabel}` : "", content.date].filter(Boolean).join(" · "), M, 252);

      const before = drawPhoto(ctx, b, { x: M, y: heroTop, w: cellW, h: cellH }, 20);
      const concept = drawPhoto(ctx, a, { x: M + cellW + 28, y: heroTop, w: cellW, h: cellH }, 20);
      drawAiTag(ctx, concept, input.isDemo ? "Demo preview" : AI_TAG);
      caption(ctx, "Before", before.x, heroTop + cellH + 22, 19, PAPER.muted);
      caption(ctx, "Concept", concept.x, heroTop + cellH + 22, 19, PAPER.champagne);
      y = firstTop;
    } else {
      drawBrandLockup(ctx, M, 92, 300, PAPER.ink);
      ctx.font = sans(20);
      ctx.fillStyle = PAPER.muted;
      ctx.textAlign = "right";
      ctx.fillText("Personalised Smile Consultation", PAGE_W - M, 100);
      ctx.textAlign = "left";
      y = 200;
    }
    for (const block of pagesBlocks[p]) {
      block.draw(ctx, y);
      y += block.height + gap;
    }
    if (p === pagesBlocks.length - 1) {
      const fy = BOTTOM - disclaimerH;
      rule(ctx, M, fy - 22, CW);
      paragraph(ctx, content.disclaimer, M, fy, CW, sans(18), PAPER.faint, 25);
    }
    pageNumber(ctx, p + 1, pagesBlocks.length);
    pages.push(await toJpeg(canvas, 0.92));
  }
  return { pages, omitted };
}

export async function consultationReportPdf(pages: Blob[]): Promise<Blob> {
  const bytes = await Promise.all(pages.map(async p => new Uint8Array(await p.arrayBuffer())));
  const pdf = jpegPagesToPdf(bytes.map(jpeg => ({ jpeg, widthPx: PAGE_W, heightPx: PAGE_H })), {
    background: PAPER_RGB,
    title: "Your SmileCompose consultation",
  });
  return new Blob([toBuffer(pdf)], { type: "application/pdf" });
}
