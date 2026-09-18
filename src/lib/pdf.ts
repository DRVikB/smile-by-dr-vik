/**
 * A minimal PDF writer for one full-bleed JPEG page.
 *
 * The presentation is composed on a canvas and exported as a JPEG, so the PDF
 * only has to wrap those bytes: PDF can carry JPEG data directly with the
 * DCTDecode filter, which means no re-encoding, no font embedding and no
 * dependency. Anything richer belongs in the canvas, not here.
 */

/** A4 in PostScript points. */
export const A4_SHORT = 595.28;
export const A4_LONG = 841.89;

const encoder = new TextEncoder();

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Fit a box inside a page, preserving its proportions. */
export function fitContain(
  imageW: number,
  imageH: number,
  pageW: number,
  pageH: number,
): { width: number; height: number; x: number; y: number } {
  if (!(imageW > 0 && imageH > 0 && pageW > 0 && pageH > 0))
    throw new Error("Page and image sizes must be positive.");
  const scale = Math.min(pageW / imageW, pageH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return { width, height, x: (pageW - width) / 2, y: (pageH - height) / 2 };
}

export interface PdfOptions {
  /** Page size in points. Defaults to A4 in the image's orientation. */
  pageWidth?: number;
  pageHeight?: number;
  /** Page background behind the image, as an RGB triple of 0-1 values. */
  background?: [number, number, number];
  title?: string;
}

/**
 * Wrap JPEG bytes in a single-page PDF. `widthPx`/`heightPx` are the image's
 * own pixel dimensions and decide the page orientation.
 */
export function jpegToPdf(
  jpeg: Uint8Array,
  widthPx: number,
  heightPx: number,
  options: PdfOptions = {},
): Uint8Array {
  if (jpeg.length === 0) throw new Error("There is no image to put in the PDF.");
  if (!(widthPx > 0 && heightPx > 0))
    throw new Error("The image has no usable dimensions.");

  const landscape = widthPx >= heightPx;
  const pageWidth = options.pageWidth ?? (landscape ? A4_LONG : A4_SHORT);
  const pageHeight = options.pageHeight ?? (landscape ? A4_SHORT : A4_LONG);
  const [bg0, bg1, bg2] = options.background ?? [1, 1, 1];
  const box = fitContain(widthPx, heightPx, pageWidth, pageHeight);
  const n = (value: number) => value.toFixed(3);

  const content =
    `${n(bg0)} ${n(bg1)} ${n(bg2)} rg\n` +
    `0 0 ${n(pageWidth)} ${n(pageHeight)} re f\n` +
    `q\n${n(box.width)} 0 0 ${n(box.height)} ${n(box.x)} ${n(box.y)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(content);

  const title = (options.title ?? "Smile preview").replace(/[\\()]/g, "");
  const objects: Uint8Array[] = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageWidth)} ${n(pageHeight)}] ` +
        `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    concat([
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${Math.round(widthPx)} ` +
          `/Height ${Math.round(heightPx)} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
          `/Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      encoder.encode("\nendstream"),
    ]),
    concat([
      encoder.encode(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      encoder.encode("\nendstream"),
    ]),
    encoder.encode(`<< /Title (${title}) /Producer (Smile by Dr Vik) >>`),
  ];

  const parts: Uint8Array[] = [latin1("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let offset = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(offset);
    const head = encoder.encode(`${index + 1} 0 obj\n`);
    const tail = encoder.encode("\nendobj\n");
    parts.push(head, body, tail);
    offset += head.length + body.length + tail.length;
  });

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) xref += `${String(at).padStart(10, "0")} 00000 n \n`;
  xref +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${offset}\n%%EOF\n`;
  parts.push(encoder.encode(xref));
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
