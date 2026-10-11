import { CONSENT_ITEMS, type CaseConsent } from "./portal";
import { jpegPagesToPdf } from "./pdf";
import { toBuffer } from "./smilePreview";

const W = 1654, H = 2339, M = 150;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function image(src: string): Promise<CanvasImageSource> {
  const blob = await (await fetch(src)).blob();
  return createImageBitmap(blob);
}

export function signedOn(at: number): string {
  return new Date(at).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The signed consent as a one-page A4 PDF, for the patient's record or a lab pack. */
export async function consentPdf(consent: CaseConsent, caseLabel: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1d1d1f"; ctx.textBaseline = "top";
  let y = M;
  ctx.font = "600 34px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#9a7b3f";
  ctx.fillText("SMILECOMPOSE", M, y); y += 70;
  ctx.font = "400 76px Georgia, serif"; ctx.fillStyle = "#1d1d1f";
  ctx.fillText("Patient consent", M, y); y += 120;
  ctx.font = "400 34px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#555";
  ctx.fillText(`${caseLabel} · signed ${signedOn(consent.signedAt)}`, M, y); y += 110;
  for (const item of CONSENT_ITEMS) {
    const agreed = consent.agreed[item.id];
    ctx.strokeStyle = "#1d1d1f"; ctx.lineWidth = 3; ctx.strokeRect(M, y + 4, 40, 40);
    if (agreed) { ctx.beginPath(); ctx.moveTo(M + 8, y + 24); ctx.lineTo(M + 18, y + 36); ctx.lineTo(M + 34, y + 12); ctx.lineWidth = 5; ctx.stroke(); }
    ctx.font = "400 36px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#1d1d1f";
    const lines = wrap(ctx, item.text, W - M * 2 - 80);
    lines.forEach((l, i) => ctx.fillText(l, M + 80, y + i * 50));
    y += lines.length * 50 + 6;
    ctx.font = "600 28px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = agreed ? "#2f7d4f" : "#8a8a8e";
    ctx.fillText(agreed ? "Agreed" : "Not agreed", M + 80, y); y += 80;
  }
  y += 30;
  ctx.font = "600 28px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#555";
  ctx.fillText("SIGNATURE", M, y); y += 50;
  const sig = await image(consent.signature);
  const sw = (sig as ImageBitmap).width, sh = (sig as ImageBitmap).height;
  const scale = Math.min(800 / sw, 260 / sh);
  ctx.drawImage(sig, M, y, sw * scale, sh * scale);
  y += 280;
  ctx.strokeStyle = "#c7c7cc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(M + 900, y); ctx.stroke(); y += 24;
  ctx.font = "400 36px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#1d1d1f";
  ctx.fillText(consent.patientName, M, y);
  ctx.font = "400 26px -apple-system, Helvetica, Arial, sans-serif"; ctx.fillStyle = "#8a8a8e";
  const foot = wrap(ctx, `Consent wording ${consent.version}. Signed on the practice’s device. The patient may withdraw any part of this consent at any time by asking the practice.`, W - M * 2);
  foot.forEach((l, i) => ctx.fillText(l, M, H - M - (foot.length - 1 - i) * 38));
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error("The consent PDF couldn’t be made."))), "image/jpeg", 0.9));
  const pdf = jpegPagesToPdf([{ jpeg: new Uint8Array(await jpeg.arrayBuffer()), widthPx: W, heightPx: H }], { title: "Patient consent" });
  return new Blob([toBuffer(pdf)], { type: "application/pdf" });
}
