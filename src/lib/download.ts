import type { GenerationResult, PreviewPreferences } from "./types";
import { composeReport, downloadBlob } from "./compose";
export async function downloadPreview(result: GenerationResult, preferences?: PreviewPreferences, testMode = false) {
  const blob = await composeReport(result.image, result, preferences, testMode);
  downloadBlob(blob, `smile-${testMode || result.mode === "mock" ? "demo" : "preview"}-${new Date().toISOString().slice(0, 10)}.jpg`);
}
