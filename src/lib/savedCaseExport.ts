import type { CaseLogEntry, CaseLogMedia } from "./types";
import type { PatientExportInput } from "./smilePreview";

/** Export the stored version, never the current editor's settings or photos. */
export function savedCaseExport(entry: CaseLogEntry, media: CaseLogMedia, record?: { consultation?: import("./caseConsultation").CaseConsultation; preferredDesignId: string | null }): PatientExportInput {
  return {
    ...(record?.consultation ? { consultation: record.consultation } : {}),
    ...(record?.preferredDesignId && record.preferredDesignId === entry.id ? { preferred: true } : {}),
    before: media.originalImage,
    after: media.image,
    settings: media.preferences?.settings,
    referenceUsed: media.preferences?.referenceUsed,
    isDemo: Boolean(entry.testMode) || entry.mode === "mock",
    patientLabel: entry.patientName,
  };
}
