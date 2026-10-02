import { captureWorkspace, type WorkspaceLease } from "./workspace";
import { createCaseRepository, getCaseRepository } from "@/services/cases/caseRepository";
import { createLibraryStore } from "./caseLibrary";
import { createValidationStore } from "./validation";
/**
 * "Export my data": everything SmileCompose holds for this clinician, as one
 * JSON file — the cases, photos, visualisations, notes and library on this
 * device, plus (when signed in) the account records held server-side.
 * The file contains patient images; it is handed to the clinician through the
 * share sheet / download and is never uploaded by SmileCompose.
 */
export interface DataExport {
  format: "smilecompose-data-export";
  version: 1;
  exportedAt: string;
  device: {
    cases: { entry: unknown; media: unknown }[];
    currentCase: unknown;
    library: unknown;
    validationScores: unknown;
    preferences: Record<string, string>;
  };
  account: unknown;
}

export async function buildDataExport(accountData: unknown = null, scope: WorkspaceLease = captureWorkspace()): Promise<DataExport> {
  const current=getCaseRepository();
  const { listAllLog, readLogMedia, readCase } = current.scope.key===scope.key&&current.scope.epoch===scope.epoch?current:createCaseRepository(scope);
  const { exportLibrary } = createLibraryStore(scope);
  const { validationRecords } = createValidationStore(scope);
  const entries = await listAllLog().catch(() => []); // includes archived and Recently Deleted
  const cases = await Promise.all(entries.map(async entry => ({ entry, media: await readLogMedia(entry.id).catch(() => null) })));
  const preferences: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("smile.") && key !== "smile.account-profile") preferences[key] = localStorage.getItem(key) ?? "";
    }
  } catch { /* storage unavailable */ }
  scope.assert();
  const currentCase = await readCase();
  const library = await exportLibrary();
  const validationScores = await validationRecords();
  scope.assert();
  return {
    format: "smilecompose-data-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    device: {
      cases,
      currentCase,
      library,
      validationScores,
      preferences,
    },
    account: accountData,
  };
}

/** Approximate bytes stored by SmileCompose on this device, when the platform reports it. */
export async function deviceStorageUsed(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return typeof estimate?.usage === "number" ? estimate.usage : null;
  } catch {
    return null;
  }
}
