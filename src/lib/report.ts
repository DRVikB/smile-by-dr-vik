import type { GenerationResult, PreviewPreferences, SmileSettings, SmileVariant } from "./types";

/** Export the settings used for this result, never a subsequently edited draft. */
export function getReportPreferences(result: GenerationResult, variants: SmileVariant[]): PreviewPreferences | undefined {
  if (result.preferences) return result.preferences;
  const variant = variants.find((v) => v.result.variationId === result.variationId);
  // Legacy variants retain their settings, but not their reference/test metadata.
  return variant ? { settings: variant.settings } : undefined;
}

export function preferenceRows(settings: SmileSettings): [string, string][] {
  return [
    ["Shade", settings.targetShade],
    ["Tooth shape", { Square: "Square", Rounded: "Round", Triangular: "Triangle" }[settings.shape]],
    ["Treatment", settings.treatment],
    ["Selected teeth", `${settings.selectedTeeth.length} teeth · ${settings.selectedTeeth.join(", ")}`],
    ["Texture", settings.texture],
    ["Result intensity", `${settings.intensity}% · subtle to enhanced`],
    ["Photo type", settings.shotType],
  ];
}

export function wrapText(ctx: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { lines.push(line); line = ""; }
      for (const character of word) {
        if (ctx.measureText(line + character).width > width && line) { lines.push(line); line = ""; }
        line += character;
      }
      line += " ";
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
