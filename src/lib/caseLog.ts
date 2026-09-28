import type { CaseLogEntry, CaseLogMedia } from "./types";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";

const DB_NAME = "smile-case-log";
const ENTRIES = "entries";
const MEDIA = "media";

/** Metadata and images are kept in separate stores so search never loads full photos. */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES))
        db.createObjectStore(ENTRIES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MEDIA))
        db.createObjectStore(MEDIA, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
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

export async function addLogEntry(
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

export type CaseState = "active" | "archived" | "deleted";

export function caseState(entry: CaseLogEntry): CaseState {
  return entry.deletedAt ? "deleted" : entry.archivedAt ? "archived" : "active";
}

/** Saved cases in the given states, newest first. Recently Deleted is excluded unless asked for. */
export async function listLog(states: CaseState[] = ["active", "archived"]): Promise<CaseLogEntry[]> {
  return (await listAllLog()).filter(entry => states.includes(caseState(entry)));
}

export async function listActiveLog(): Promise<CaseLogEntry[]> {
  return listLog(["active"]);
}

/** Every stored entry, including Recently Deleted (export, purge). Newest first. */
export async function listAllLog(): Promise<CaseLogEntry[]> {
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

export interface CaseCounts { active: number; archived: number; deleted: number }

export async function caseCounts(): Promise<CaseCounts> {
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

function without(entry: CaseLogEntry, key: "archivedAt" | "deletedAt"): CaseLogEntry {
  const copy = { ...entry };
  delete copy[key];
  return copy;
}

export function setCaseArchived(id: string, archived: boolean, now = Date.now()): Promise<boolean> {
  return patchEntry(id, entry => (archived ? { ...entry, archivedAt: now } : without(entry, "archivedAt")));
}

/** Move to Recently Deleted. Photos stay on this device until the window ends or the user deletes permanently. */
export function moveToRecentlyDeleted(id: string, now = Date.now()): Promise<boolean> {
  return patchEntry(id, entry => ({ ...entry, deletedAt: now }));
}

export function restoreCase(id: string): Promise<boolean> {
  return patchEntry(id, entry => without(entry, "deletedAt"));
}

export async function moveAllToRecentlyDeleted(now = Date.now()): Promise<void> {
  for (const entry of await listLog(["active", "archived"])) await moveToRecentlyDeleted(entry.id, now);
}

export function recentlyDeletedExpiry(entry: CaseLogEntry, days = RECENTLY_DELETED_DAYS): number | null {
  return entry.deletedAt ? entry.deletedAt + days * 86_400_000 : null;
}

/** Permanently remove cases whose Recently Deleted window has ended. Returns how many were removed. */
export async function purgeRecentlyDeleted(now = Date.now(), days = RECENTLY_DELETED_DAYS): Promise<number> {
  const expired = (await listAllLog()).filter(entry => {
    const expiry = recentlyDeletedExpiry(entry, days);
    return expiry !== null && expiry <= now;
  });
  for (const entry of expired) await deleteLogEntry(entry.id);
  return expired.length;
}

/** Permanently remove everything in Recently Deleted. */
export async function emptyRecentlyDeleted(): Promise<void> {
  for (const entry of await listLog(["deleted"])) await deleteLogEntry(entry.id);
}

export async function searchLog(query: string): Promise<CaseLogEntry[]> {
  const all = await listLog();
  return all.filter((entry) => matchesQuery(entry, query));
}

export async function readLogMedia(id: string): Promise<CaseLogMedia | null> {
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
export async function updateLogReview(id: string, review?: CaseLogMedia["review"]): Promise<boolean> {
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
export async function deleteLogEntry(id: string): Promise<void> {
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

export async function clearLog(): Promise<void> {
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
