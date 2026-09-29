/** Public identity shared by the interface and patient exports. */
export const SMILECOMPOSE = {
  name: "SmileCompose",
  wordmark: "SMILECOMPOSE",
  tagline: "Smile design, visualised.",
  descriptor: "Digital Smile Design",
  signature: "Designed by Dr Vik",
  supportingLine: "Plan · Visualise · Communicate · Transform",
  disclaimer: "Concept visualisation only. Final clinical outcomes depend on diagnosis, treatment planning, biological factors and treatment performed.",
  colors: {
    ivory: "#FAF9F6", stone: "#E6DED4", sand: "#C9B8A1",
    taupe: "#A08F7E", charcoal: "#3C3C3C", gold: "#D4B583",
  },
} as const;

let designerName: string | null = null;

/**
 * The clinician credited on everything a patient receives (exports, report,
 * reveal video, consultation screen): "Smile design by Dr Smith". Set from the
 * signed-in profile; empty when no name is known, so nothing is drawn.
 * "Designed by Dr Vik" credits the app itself and stays on app screens only.
 */
export function setDesignerName(name: string | null | undefined): void {
  designerName = name?.trim() || null;
}
export function designCredit(): string {
  return designerName ? `Smile design by ${designerName}` : "";
}

/** Draw the same arc-and-guides mark used by the app and installed icon. */
export function drawBrandLockup(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string = SMILECOMPOSE.colors.charcoal) {
  ctx.save();
  const unit = width / 540;
  ctx.translate(x, y);
  ctx.scale(unit, unit);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(0, 0, 54, 54, 15);
  ctx.stroke();
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(27, 10); ctx.lineTo(27, 44);
  ctx.moveTo(10, 25); ctx.lineTo(44, 25);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(13, 23); ctx.bezierCurveTo(19, 39, 35, 39, 41, 23);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '400 34px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.letterSpacing = "4px";
  ctx.fillText(SMILECOMPOSE.wordmark, 72, 28, 468);
  ctx.restore();
}
