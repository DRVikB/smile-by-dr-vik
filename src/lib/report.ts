import { activeToothPlans, resolvedToothIntent } from "./teeth";
import type { GenerationResult, PreviewPreferences, SmileSettings, SmileVariant } from "./types";

/** Export the settings used for this result, never a subsequently edited draft. */
export function getReportPreferences(result: GenerationResult, variants: SmileVariant[]): PreviewPreferences | undefined {
  if (result.preferences) return result.preferences;
  const variant = variants.find((v) => v.result.variationId === result.variationId);
  // Legacy variants retain their settings, but not their reference/test metadata.
  return variant ? { settings: variant.settings } : undefined;
}

export function preferenceRows(settings: SmileSettings): [string, string][] {
  const colourOnly = activeToothPlans(settings).every(p => resolvedToothIntent(settings, p) === "Shade only");
  return [
    ["Shade", settings.targetShade],
    ["Tooth shape", colourOnly ? "Unchanged (shade only)" : { Square: "Square", Rounded: "Round", Triangular: "Triangle" }[settings.shape]],
    [colourOnly ? "Material reference" : "Treatment", settings.treatment],
    ["Design goal", settings.designIntent ?? "Auto"],
    ["Selected teeth", `${settings.selectedTeeth.length} teeth · ${settings.selectedTeeth.join(", ")}`],
    ["Texture", colourOnly ? "Unchanged" : settings.texture],
    ["Result intensity", colourOnly ? "No shape change" : `${settings.intensity}% · subtle to enhanced`],
    ["Photo type", settings.shotType],
    ...(settings.toothPlans ? settings.toothPlans.map(p => [`Tooth ${p.tooth}`, `${p.condition === "Missing" ? "Missing · preserve" : `${p.condition} · ${resolvedToothIntent(settings, p)}`}${p.intent !== "Preserve" && p.condition !== "Missing" ? ` · ${p.targetShade ?? settings.targetShade}` : ""}`] as [string,string]) : []),
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
