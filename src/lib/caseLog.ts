import { captureWorkspace, workspaceDatabase, guardStore, type WorkspaceLease } from "./workspace";
import type { CaseLogEntry, CaseLogMedia } from "./types";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import { EXPORT_HISTORY_MAX, type ExportRecord } from "./consultation";

const DB_NAME = "smile-case-log";
const ENTRIES = "entries";
const MEDIA = "media";

export function formatLogDate(createdAt: number): string {
  const d = new Date(createdAt);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/** Filename-safe label: patient name, date and time. */
export function logFileName(entry: CaseLogEntry): string {
  const d = new Date(entry.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const name =
    (entry.patientName || "Unnamed")
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "Unnamed";
  return `${name}_${stamp}`;
}

export function matchesQuery(entry: CaseLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const iso = new Date(entry.createdAt).toISOString().slice(0, 10);
  return [
    entry.patientName,
    entry.summary,
    entry.label ?? "",
    formatLogDate(entry.createdAt),
    iso,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export type CaseState = "active" | "archived" | "deleted";

export function caseState(entry: CaseLogEntry): CaseState {
  return entry.deletedAt ? "deleted" : entry.archivedAt ? "archived" : "active";
}

export interface CaseCounts { active: number; archived: number; deleted: number }

function without(entry: CaseLogEntry, key: "archivedAt" | "deletedAt"): CaseLogEntry {
  const copy = { ...entry };
  delete copy[key];
  return copy;
}

/** Longest case reference, matching the field in the design screen. */
export const CASE_REFERENCE_MAX = 24;

export function recentlyDeletedExpiry(entry: CaseLogEntry, days = RECENTLY_DELETED_DAYS): number | null {
  return entry.deletedAt ? entry.deletedAt + days * 86_400_000 : null;
}

export function createCaseLogStore(scope: WorkspaceLease, factory:IDBFactory=globalThis.indexedDB) {
  /** Metadata and images are kept in separate stores so search never loads full photos. */
  function open(): Promise<IDBDatabase> {
    scope.assert();
    return new Promise((resolve, reject) => {
      const req = factory.open(workspaceDatabase(DB_NAME, scope), scope.owner.kind === "legacy" ? 1 : 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (scope.owner.kind !== "legacy" && !db.objectStoreNames.contains("imports")) db.createObjectStore("imports");
        if (!db.objectStoreNames.contains(ENTRIES))
          db.createObjectStore(ENTRIES, { keyPath: "id" });
        if (!db.objectStoreNames.contains(MEDIA))
          db.createObjectStore(MEDIA, { keyPath: "id" });
      };
      req.onsuccess = () => { try { scope.assert(); req.result.onversionchange = () => req.result.close(); resolve(req.result); } catch (error) { req.result.close(); reject(error); } };
      req.onerror = () => reject(req.error);
    });
  }

  function settled(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function addLogEntry(
    entry: CaseLogEntry,
    media: CaseLogMedia,
  ): Promise<void> {
    const db = await open();
    try {
      const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
      tx.objectStore(ENTRIES).put(entry);
      tx.objectStore(MEDIA).put(media);
      await settled(tx);
    } finally {
      db.close();
    }
  }

  /** Saved cases in the given states, newest first. Recently Deleted is excluded unless asked for. */
  async function listLog(states: CaseState[] = ["active", "archived"]): Promise<CaseLogEntry[]> {
    return (await listAllLog()).filter(entry => states.includes(caseState(entry)));
  }

  async function listActiveLog(): Promise<CaseLogEntry[]> {
    return listLog(["active"]);
  }

  /** Every stored entry, including Recently Deleted (export, purge). Newest first. */
  async function listAllLog(): Promise<CaseLogEntry[]> {
    const db = await open();
    try {
      const all = await new Promise<CaseLogEntry[]>((resolve, reject) => {
        const req = db
          .transaction(ENTRIES, "readonly")
          .objectStore(ENTRIES)
          .getAll();
        req.onsuccess = () => resolve((req.result as CaseLogEntry[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      return all.sort((a, b) => b.createdAt - a.createdAt);
    } finally {
      db.close();
    }
  }

  async function caseCounts(): Promise<CaseCounts> {
    const counts: CaseCounts = { active: 0, archived: 0, deleted: 0 };
    for (const entry of await listAllLog()) counts[caseState(entry)]++;
    return counts;
  }

  async function patchEntry(id: string, change: (entry: CaseLogEntry) => CaseLogEntry): Promise<boolean> {
    const db = await open();
    try {
      const tx = db.transaction(ENTRIES, "readwrite");
      const done = settled(tx);
      let updated = false;
      const store = tx.objectStore(ENTRIES);
      const request = store.get(id);
      request.onsuccess = () => {
        const entry = request.result as CaseLogEntry | undefined;
        if (!entry) return;
        store.put(change(entry));
        updated = true;
      };
      await done;
      return updated;
    } finally {
      db.close();
    }
  }

  function setCaseArchived(id: string, archived: boolean, now = Date.now()): Promise<boolean> {
    return patchEntry(id, entry => (archived ? { ...entry, archivedAt: now } : without(entry, "archivedAt")));
  }

  /** Move to Recently Deleted. Photos stay on this device until the window ends or the user deletes permanently. */
  function moveToRecentlyDeleted(id: string, now = Date.now()): Promise<boolean> {
    return patchEntry(id, entry => ({ ...entry, deletedAt: now }));
  }

  function restoreCase(id: string): Promise<boolean> {
    return patchEntry(id, entry => without(entry, "deletedAt"));
  }

  /** Star or unstar one version. */
  function setFavourite(id: string, favourite: boolean): Promise<boolean> {
    return patchEntry(id, entry => {
      const copy = { ...entry };
      if (favourite) copy.favourite = true;
      else delete copy.favourite;
      return copy;
    });
  }

  /**
   * Note what was made for the patient from this version (a Smile Preview or a
   * Consultation Report, with its reviewed settings). The file itself isn't
   * kept: it is made again from the saved case whenever it's needed.
   */
  function recordExport(id: string, record: ExportRecord): Promise<boolean> {
    return patchEntry(id, entry => ({ ...entry, exports: [record, ...(entry.exports ?? [])].slice(0, EXPORT_HISTORY_MAX) }));
  }

  /** Rename a whole case: every version in it takes the new reference. Returns how many changed. */
  async function renameCase(caseKey: string, name: string): Promise<number> {
    const reference = name.replace(/\s+/g, " ").trim().slice(0, CASE_REFERENCE_MAX);
    const db = await open();
    try {
      const tx = db.transaction(ENTRIES, "readwrite");
      const done = settled(tx);
      const store = tx.objectStore(ENTRIES);
      let changed = 0;
      const request = store.getAll();
      request.onsuccess = () => {
        for (const entry of (request.result as CaseLogEntry[]) ?? []) {
          if ((entry.caseId ?? entry.id) !== caseKey) continue;
          store.put({ ...entry, patientName: reference });
          changed += 1;
        }
      };
      await done;
      return changed;
    } finally {
      db.close();
    }
  }

  async function moveAllToRecentlyDeleted(now = Date.now()): Promise<void> {
    for (const entry of await listLog(["active", "archived"])) await moveToRecentlyDeleted(entry.id, now);
  }

  /** Permanently remove cases whose Recently Deleted window has ended. Returns how many were removed. */
  async function purgeRecentlyDeleted(now = Date.now(), days = RECENTLY_DELETED_DAYS): Promise<number> {
    const expired = (await listAllLog()).filter(entry => {
      const expiry = recentlyDeletedExpiry(entry, days);
      return expiry !== null && expiry <= now;
    });
    for (const entry of expired) await deleteLogEntry(entry.id);
    return expired.length;
  }

  /** Permanently remove everything in Recently Deleted. */
  async function emptyRecentlyDeleted(): Promise<void> {
    for (const entry of await listLog(["deleted"])) await deleteLogEntry(entry.id);
  }

  async function searchLog(query: string): Promise<CaseLogEntry[]> {
    const all = await listLog();
    return all.filter((entry) => matchesQuery(entry, query));
  }

  async function readLogMedia(id: string): Promise<CaseLogMedia | null> {
    const db = await open();
    try {
      return await new Promise<CaseLogMedia | null>((resolve, reject) => {
        const req = db.transaction(MEDIA, "readonly").objectStore(MEDIA).get(id);
        req.onsuccess = () => resolve((req.result as CaseLogMedia) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  /** Update only an existing version; never resurrect a case the user deleted. */
  async function updateLogReview(id: string, review?: CaseLogMedia["review"]): Promise<boolean> {
    const db = await open();
    try {
      const tx = db.transaction(MEDIA, "readwrite");
      const done = settled(tx);
      let updated = false;
      const store = tx.objectStore(MEDIA);
      const request = store.get(id);
      request.onsuccess = () => {
        const media = request.result as CaseLogMedia | undefined;
        if (!media) return;
        if (review) media.review = review;
        else delete media.review;
        store.put(media);
        updated = true;
      };
      await done;
      return updated;
    } finally {
      db.close();
    }
  }

  /** Permanent deletion of one saved case (entry and its photos). */
  async function deleteLogEntry(id: string): Promise<void> {
    const db = await open();
    try {
      const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
      tx.objectStore(ENTRIES).delete(id);
      tx.objectStore(MEDIA).delete(id);
      await settled(tx);
    } finally {
      db.close();
    }
  }

  async function clearLog(): Promise<void> {
    const db = await open();
    try {
      const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
      tx.objectStore(ENTRIES).clear();
      tx.objectStore(MEDIA).clear();
      await settled(tx);
    } finally {
      db.close();
    }
  }
  /** Replace one cloud case's metadata only; media is loaded through the repository on demand. */
  async function replaceCaseMetadata(caseId: string, entries: CaseLogEntry[]) {
    const db = await open();
    try { await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([ENTRIES,MEDIA],"readwrite");
      const r=tx.objectStore(ENTRIES).getAll();
      r.onsuccess=()=>{for(const e of r.result as CaseLogEntry[])if((e.caseId??e.id)===caseId){tx.objectStore(ENTRIES).delete(e.id);tx.objectStore(MEDIA).delete(e.id);}
        for(const e of entries)tx.objectStore(ENTRIES).put(e);};
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
    }); } finally {db.close();}
  }
  async function removeLogMedia(ids: string[]) {
    const db=await open();try{const tx=db.transaction(MEDIA,"readwrite");for(const id of ids)tx.objectStore(MEDIA).delete(id);await settled(tx);}finally{db.close();}
  }
  return guardStore(scope, { replaceCaseMetadata, removeLogMedia, addLogEntry, listLog, listActiveLog, listAllLog, caseCounts, setCaseArchived, moveToRecentlyDeleted, restoreCase, setFavourite, recordExport, renameCase, moveAllToRecentlyDeleted, purgeRecentlyDeleted, emptyRecentlyDeleted, searchLog, readLogMedia, updateLogReview, deleteLogEntry, clearLog });

}
export const addLogEntry = (...args: Parameters<ReturnType<typeof createCaseLogStore>["addLogEntry"]>) => createCaseLogStore(captureWorkspace()).addLogEntry(...args);
export const listLog = (...args: Parameters<ReturnType<typeof createCaseLogStore>["listLog"]>) => createCaseLogStore(captureWorkspace()).listLog(...args);
export const listActiveLog = (...args: Parameters<ReturnType<typeof createCaseLogStore>["listActiveLog"]>) => createCaseLogStore(captureWorkspace()).listActiveLog(...args);
export const listAllLog = (...args: Parameters<ReturnType<typeof createCaseLogStore>["listAllLog"]>) => createCaseLogStore(captureWorkspace()).listAllLog(...args);
export const caseCounts = (...args: Parameters<ReturnType<typeof createCaseLogStore>["caseCounts"]>) => createCaseLogStore(captureWorkspace()).caseCounts(...args);
export const setCaseArchived = (...args: Parameters<ReturnType<typeof createCaseLogStore>["setCaseArchived"]>) => createCaseLogStore(captureWorkspace()).setCaseArchived(...args);
export const moveToRecentlyDeleted = (...args: Parameters<ReturnType<typeof createCaseLogStore>["moveToRecentlyDeleted"]>) => createCaseLogStore(captureWorkspace()).moveToRecentlyDeleted(...args);
export const restoreCase = (...args: Parameters<ReturnType<typeof createCaseLogStore>["restoreCase"]>) => createCaseLogStore(captureWorkspace()).restoreCase(...args);
export const setFavourite = (...args: Parameters<ReturnType<typeof createCaseLogStore>["setFavourite"]>) => createCaseLogStore(captureWorkspace()).setFavourite(...args);
export const recordExport = (...args: Parameters<ReturnType<typeof createCaseLogStore>["recordExport"]>) => createCaseLogStore(captureWorkspace()).recordExport(...args);
export const renameCase = (...args: Parameters<ReturnType<typeof createCaseLogStore>["renameCase"]>) => createCaseLogStore(captureWorkspace()).renameCase(...args);
export const moveAllToRecentlyDeleted = (...args: Parameters<ReturnType<typeof createCaseLogStore>["moveAllToRecentlyDeleted"]>) => createCaseLogStore(captureWorkspace()).moveAllToRecentlyDeleted(...args);
export const purgeRecentlyDeleted = (...args: Parameters<ReturnType<typeof createCaseLogStore>["purgeRecentlyDeleted"]>) => createCaseLogStore(captureWorkspace()).purgeRecentlyDeleted(...args);
export const emptyRecentlyDeleted = (...args: Parameters<ReturnType<typeof createCaseLogStore>["emptyRecentlyDeleted"]>) => createCaseLogStore(captureWorkspace()).emptyRecentlyDeleted(...args);
export const searchLog = (...args: Parameters<ReturnType<typeof createCaseLogStore>["searchLog"]>) => createCaseLogStore(captureWorkspace()).searchLog(...args);
export const readLogMedia = (...args: Parameters<ReturnType<typeof createCaseLogStore>["readLogMedia"]>) => createCaseLogStore(captureWorkspace()).readLogMedia(...args);
export const updateLogReview = (...args: Parameters<ReturnType<typeof createCaseLogStore>["updateLogReview"]>) => createCaseLogStore(captureWorkspace()).updateLogReview(...args);
export const deleteLogEntry = (...args: Parameters<ReturnType<typeof createCaseLogStore>["deleteLogEntry"]>) => createCaseLogStore(captureWorkspace()).deleteLogEntry(...args);
export const clearLog = (...args: Parameters<ReturnType<typeof createCaseLogStore>["clearLog"]>) => createCaseLogStore(captureWorkspace()).clearLog(...args);
