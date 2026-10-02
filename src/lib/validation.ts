import { captureWorkspace, workspaceDatabase, guardStore, type WorkspaceLease } from "./workspace";
import { z } from "./zod";
import { settingsSchema } from "./generation/schema";
export const validationMetrics = ["Tooth contours", "Gums preserved", "Untreated teeth preserved", "Material appearance"] as const;
export const validationSchema = z.object({
  id: z.string().min(1), caseId: z.string().min(1), variationId: z.string().min(1), createdAt: z.number().finite(),
  reviewer: z.string().min(1).max(80), notes: z.string().max(1000),
  scores: z.object(Object.fromEntries(validationMetrics.map(m => [m, z.number().int().min(1).max(5)])) as Record<typeof validationMetrics[number], z.ZodNumber>),
  settings: settingsSchema, estimatedUsd: z.number().nonnegative().optional(), elapsedSeconds: z.number().nonnegative().optional(),
});
export type ValidationRecord = z.infer<typeof validationSchema>;

export function createValidationStore(scope: WorkspaceLease) {
  function open(): Promise<IDBDatabase> {
    scope.assert(); return new Promise((resolve,reject) => {
    const req = indexedDB.open(workspaceDatabase("smile-validation", scope), 1);
    req.onupgradeneeded = () => req.result.createObjectStore("scores", {keyPath:"id"});
    req.onsuccess = () => { try { scope.assert(); req.result.onversionchange = () => req.result.close(); resolve(req.result); } catch (error) { req.result.close(); reject(error); } }; req.onerror = () => reject(req.error);
  }); }

  async function saveValidationRecord(record: ValidationRecord) {
    const data = validationSchema.parse(record); const db = await open();
    try { await new Promise<void>((resolve,reject) => {
      const tx = db.transaction("scores","readwrite"); tx.objectStore("scores").put(data);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }

  async function validationRecords(): Promise<ValidationRecord[]> {
    const db = await open(); try { return await new Promise((resolve,reject) => {
      const req = db.transaction("scores","readonly").objectStore("scores").getAll();
      req.onsuccess = () => resolve(req.result.filter((v: unknown) => validationSchema.safeParse(v).success)); req.onerror = () => reject(req.error);
    }); } finally { db.close(); }
  }

  async function deleteValidationRecords(caseId: string) {
    const records = (await validationRecords()).filter(r => r.caseId === caseId); const db = await open();
    try { await new Promise<void>((resolve,reject) => { const tx = db.transaction("scores","readwrite"); records.forEach(r => tx.objectStore("scores").delete(r.id)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
  }

  async function exportValidationRecords() {
    const records = await validationRecords();
    const blob = new Blob([JSON.stringify({ version: 1, description: "Clinician ratings, not a validated clinical accuracy score. 1 = poor, 5 = close match. No patient photographs included.", records }, null, 2)], { type: "application/json" });
    const { saveFile } = await import("./share");
    scope.assert();
    await saveFile(blob, "smilecompose-validation-scores.json", "SmileCompose validation scores");
  }
  return guardStore(scope, { saveValidationRecord, validationRecords, deleteValidationRecords, exportValidationRecords });

}
export const saveValidationRecord = (...args: Parameters<ReturnType<typeof createValidationStore>["saveValidationRecord"]>) => createValidationStore(captureWorkspace()).saveValidationRecord(...args);
export const validationRecords = (...args: Parameters<ReturnType<typeof createValidationStore>["validationRecords"]>) => createValidationStore(captureWorkspace()).validationRecords(...args);
export const deleteValidationRecords = (...args: Parameters<ReturnType<typeof createValidationStore>["deleteValidationRecords"]>) => createValidationStore(captureWorkspace()).deleteValidationRecords(...args);
export const exportValidationRecords = (...args: Parameters<ReturnType<typeof createValidationStore>["exportValidationRecords"]>) => createValidationStore(captureWorkspace()).exportValidationRecords(...args);
