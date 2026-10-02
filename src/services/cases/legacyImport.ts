import { getCaseRepository } from "./caseRepository";
import { captureWorkspace, legacyWorkspace, workspaceDatabase, type WorkspaceLease } from "@/lib/workspace";
import { createCaseLogStore } from "@/lib/caseLog";
import type { CaseLogEntry, CaseLogMedia, SmileCase } from "@/lib/types";

export interface LegacyCaseChoice { key: string; caseId: string; name: string; versions: number; draft: boolean; sample: boolean }
type Source = "legacy" | "unowned";
const sourceScope = (source: Source, target: WorkspaceLease): WorkspaceLease => ({ ...target, owner: { kind: source }, key: source });
function requireAccount(scope: WorkspaceLease) {
  scope.assert(); if (scope.owner.kind !== "account") throw new Error("Sign in to import existing cases.");
}
async function open(base: string, scope: WorkspaceLease): Promise<IDBDatabase> {
  scope.assert();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(workspaceDatabase(base, scope), base === "smile-case-log" && scope.owner.kind !== "legacy" ? 2 : 1);
    req.onupgradeneeded = () => {
      if (base === "smile-case-log") {
        if (!req.result.objectStoreNames.contains("entries")) req.result.createObjectStore("entries", { keyPath: "id" });
        if (!req.result.objectStoreNames.contains("media")) req.result.createObjectStore("media", { keyPath: "id" });
        if (scope.owner.kind !== "legacy" && !req.result.objectStoreNames.contains("imports")) req.result.createObjectStore("imports");
      } else req.result.createObjectStore("case");
    };
    req.onsuccess = () => { try { scope.assert(); req.result.onversionchange = () => req.result.close(); resolve(req.result); } catch (e) { req.result.close(); reject(e); } };
    req.onerror = () => reject(req.error);
  });
}
async function rawDraft(scope: WorkspaceLease): Promise<SmileCase | null> {
  const db = await open("smile-temporary-case", scope);
  try { return await new Promise((resolve, reject) => { const req = db.transaction("case").objectStore("case").get("current"); req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error); }); }
  finally { db.close(); }
}
/** No thumbnails or photographs exposed until the authenticated clinician asks to inspect legacy cases. */
export async function listLegacyCases(scope = captureWorkspace()): Promise<LegacyCaseChoice[]> {
  requireAccount(scope);
  const choices: LegacyCaseChoice[] = [];
  for (const source of ["legacy", "unowned"] as const) {
    const local = sourceScope(source, scope);
    const entries = await createCaseLogStore(local).listAllLog();
    const groups = new Map<string, CaseLogEntry[]>();
    for (const entry of entries) { const id = entry.caseId ?? entry.id; groups.set(id, [...(groups.get(id) ?? []), entry]); }
    const draft = await rawDraft(local);
    const draftId = draft ? draft.caseId ?? "photo-only-draft" : null;
    if (draftId && !groups.has(draftId)) groups.set(draftId, []);
    for (const [caseId, versions] of groups) {
      const hasDraft = draftId === caseId;
      choices.push({ key: JSON.stringify([source, caseId]), caseId, name: versions[0]?.patientName || (hasDraft ? draft?.patientName : "") || "Unnamed case",
        versions: versions.filter(e => !isSample(e)).length, draft: hasDraft && !draft?.testMode, sample: versions.every(isSample) && (!hasDraft || Boolean(draft?.testMode)) });
    }
  }
  scope.assert(); return choices;
}
const isSample = (entry: CaseLogEntry) => Boolean(entry.testMode || entry.mode === "mock");
interface ImportedEntry extends CaseLogEntry { legacyImport?: { source: Source; id: string } }
/** Copy a version plus its receipt atomically. Never replace an already imported/edited version. */
async function copyVersion(target: WorkspaceLease, source: Source, entry: CaseLogEntry, media: CaseLogMedia): Promise<void> {
  const db = await open("smile-case-log", target);
  let copied = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["entries", "media", "imports"], "readwrite");
      const store = tx.objectStore("entries");
      const receipts = tx.objectStore("imports");
      const receiptKey = `${source}:${entry.id}`;
      const receipt = receipts.get(receiptKey);
      let failure: Error | null = null;
      receipt.onsuccess = () => {
        if (receipt.result) return;
        const req = store.get(entry.id);
        req.onsuccess = () => {
        try {
          target.assert(); const existing = req.result as ImportedEntry | undefined;
          if (existing?.legacyImport?.source === source && existing.legacyImport.id === entry.id) return;
          if (existing) throw new Error("A different case already uses this version ID. Nothing was overwritten.");
          copied = true; store.put({ ...entry, legacyImport: { source, id: entry.id } }); tx.objectStore("media").put(media); receipts.put({ importedAt: Date.now() }, receiptKey);
        } catch (e) { failure = e as Error; tx.abort(); }
        };
      };
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error("Import interrupted. Retry to resume."));
    });
  } finally { db.close(); }
  target.assert();
  const log = createCaseLogStore(target);
  const stored = (await log.listAllLog()).find(e => e.id === entry.id) as ImportedEntry | undefined;
  const storedMedia = await log.readLogMedia(entry.id);
  // IDB stores the complete structured clones in one transaction. Verify receipt + both records before proceeding.
  if (copied && (!stored || JSON.stringify(stored) !== JSON.stringify({ ...entry, legacyImport: { source, id: entry.id } }) || JSON.stringify(storedMedia) !== JSON.stringify(media))) throw new Error("The imported version could not be verified. Original data was kept.");
}
async function copyDraft(target: WorkspaceLease, source: Source, draft: SmileCase) {
  const db = await open("smile-temporary-case", target);
  let copied = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("case", "readwrite"); const store = tx.objectStore("case");
      const receiptKey = `legacy-import:${source}:${draft.caseId ?? "photo-only-draft"}`;
      let failure: Error | null = null;
      const receipt = store.get(receiptKey);
      receipt.onsuccess = () => {
        if (receipt.result) return;
        const current = store.get("current");
        current.onsuccess = () => {
          try {
            target.assert();
            if (current.result) throw new Error("Your account already has a current draft. Finish or reset it before importing this draft.");
            copied = true; store.put(draft, "current"); store.put({ importedAt: Date.now() }, receiptKey);
          } catch (e) { failure = e as Error; tx.abort(); }
        };
      };
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(failure ?? tx.error);
    });
  } finally { db.close(); }
  target.assert();
  if (copied && JSON.stringify(await rawDraft(target)) !== JSON.stringify(draft)) throw new Error("Draft import could not be verified. Original data was kept.");
}
/** Selected-only, resumable. Account copy and binary uploads stay durable until cloud acknowledgement. Legacy originals are retained for recovery. */
export async function importLegacyCases(keys: string[], scope = captureWorkspace()): Promise<number> {
  requireAccount(scope);
  const choices = await listLegacyCases(scope);
  let imported = 0;
  for (const key of new Set(keys)) {
    const choice = choices.find(c => c.key === key);
    if (!choice || choice.sample) continue; // sample content never assigned through patient migration
    const [source] = JSON.parse(key) as [Source, string];
    const local = sourceScope(source, scope); const log = createCaseLogStore(local);
    const entries = (await log.listAllLog()).filter(e => (e.caseId ?? e.id) === choice.caseId && !isSample(e));
    for (const entry of entries) {
      const media = await log.readLogMedia(entry.id);
      if (!media) throw new Error("A legacy photograph is missing. Originals were kept; restore it before retrying.");
      await copyVersion(scope, source, entry, media);
    }
    if (choice.draft) { const draft = await rawDraft(local); if (draft) await copyDraft(scope, source, draft); }
    const repository=getCaseRepository();scope.assert();
    if(repository.scope.key!==scope.key)throw new Error("The account changed during import.");
    for(const id of new Set(entries.map(e=>e.caseId??e.id)))await repository.importOwnedCase(id);
    const current=await rawDraft(scope);if(current?.caseId)await repository.importOwnedCase(current.caseId);
    imported++;
  }
  scope.assert(); return imported;
}
// Original unsuffixed databases remain recoverable; this stage deliberately never deletes them.
export { legacyWorkspace };
