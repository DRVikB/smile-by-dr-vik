import type { CaseLogEntry, CaseLogMedia } from "./types";
import type { PatientExportInput } from "./smilePreview";

/** Export the stored version, never the current editor's settings or photos. */
export function savedCaseExport(entry: CaseLogEntry, media: CaseLogMedia): PatientExportInput {
  return {
    before: media.originalImage,
    after: media.image,
    settings: media.preferences?.settings,
    referenceUsed: media.preferences?.referenceUsed,
    isDemo: Boolean(entry.testMode) || entry.mode === "mock",
    patientLabel: entry.patientName,
  };
}
