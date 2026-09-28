import type { ImageResolution } from "./cost";

/**
 * Generation quality modes. The clinician sees "Draft" / "Standard" in the
 * cost panel and "Generate Smile" everywhere else — never a model name.
 *
 * Both modes currently use the same configured model and differ only in
 * output resolution. To vary models or settings per mode later, change
 * GENERATION_MODES here and the model choice in getSmileProvider() (server).
 */
export const generationModes = ["preview", "final"] as const;
export type GenerationMode = typeof generationModes[number];

export const GENERATION_MODES: Record<GenerationMode, { resolution: ImageResolution }> = {
  preview: { resolution: "512" },
  final: { resolution: "1K" },
};

export function modeForResolution(resolution: ImageResolution): GenerationMode {
  return resolution === "512" ? "preview" : "final";
}
