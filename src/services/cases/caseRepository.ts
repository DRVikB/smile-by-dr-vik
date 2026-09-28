import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";
import { buildCase, caseIdOf, summariseCases, type SmileComposeCase, type SmileComposeCaseSummary } from "@/models/case";

/**
 * Case persistence boundary. Screens and services depend on this interface,
 * not on a storage technology. Today every case stays on this device
 * (IndexedDB). When accounts and secure cloud storage are added, provide
 * another implementation and select it with setCaseRepository(); patient
 * media must never go to public storage.
 */
export interface CaseRepository {
  listCases(): Promise<SmileComposeCaseSummary[]>;
  getCase(id: string): Promise<SmileComposeCase | null>;
  recordVisualisation(entry: CaseLogEntry, media: CaseLogMedia): Promise<void>;
}

export const deviceCaseRepository: CaseRepository = {
  async listCases() {
    const { listLog } = await import("@/lib/caseLog");
    return summariseCases(await listLog());
  },
  async getCase(id) {
    const { listLog, readLogMedia } = await import("@/lib/caseLog");
    const entries = (await listLog()).filter(e => caseIdOf(e) === id);
    const media = new Map<string, CaseLogMedia>();
    for (const entry of entries) {
      const m = await readLogMedia(entry.id);
      if (m) media.set(entry.id, m);
    }
    return buildCase(id, entries, media);
  },
  async recordVisualisation(entry, media) {
    const { addLogEntry } = await import("@/lib/caseLog");
    await addLogEntry(entry, media);
  },
};

let repository: CaseRepository = deviceCaseRepository;

export function getCaseRepository(): CaseRepository {
  return repository;
}

export function setCaseRepository(next: CaseRepository): void {
  repository = next;
}
